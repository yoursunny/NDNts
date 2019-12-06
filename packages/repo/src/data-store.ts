import { canSatisfy, Data, ImplicitDigest, Interest, LLSign, Name } from "@ndn/packet";
import { Encoder, toHex } from "@ndn/tlv";
import { AbstractLevelDOWN } from "abstract-leveldown";
import { EventEmitter } from "events";
import { collect, filter, fromStream, map, pipeline, transform } from "streaming-iterables";
import StrictEventEmitter from "strict-event-emitter-types";
import throat from "throat";

import { Db, DbChain, filterExpired, isExpired, openDb, Record } from "./db";

interface Events {
  /** Emitted when a new record is inserted. */
  insert: Name;
  /** Emitted when an existing record is deleted. */
  delete: Name;
}

type Emitter = StrictEventEmitter<EventEmitter, Events>;

/** Data packet storage based on LevelDB or other abstract-leveldown store. */
export class DataStore extends (EventEmitter as new() => Emitter) {
  private readonly db: Db;
  public readonly mutex = throat(1);

  /**
   * Constructor.
   * @param db an abstract-leveldown compatible store. It must support Buffer as keys.
   */
  constructor(db: AbstractLevelDOWN) {
    super();
    this.db = openDb(db);
  }

  /** Close the store. */
  public close(): Promise<void> {
    return this.db.close();
  }

  private async *iterRecords(prefix?: Name): AsyncGenerator<Record> {
    const it = fromStream<{ key: Name, value: Record }>(
      this.db.createReadStream(prefix ? { gte: prefix } : undefined));
    for await (const { key: name, value: record } of it) {
      if (prefix?.isPrefixOf(name) === false) { break; }
      Object.defineProperty(record, "name", { value: name });
      yield record;
    }
  }

  /** List Data packets, optionally filtered by name prefix. */
  public list(prefix?: Name): AsyncIterable<Data> {
    return pipeline(
      () => this.iterRecords(prefix),
      filter(filterExpired(false)),
      map(({ data }) => data),
    );
  }

  /** List Data names, optionally filtered by name prefix. */
  public listNames(prefix?: Name): AsyncIterable<Name> {
    return pipeline(
      () => this.iterRecords(prefix),
      filter(filterExpired(false)),
      map(({ name }) => name),
    );
  }

  /** Retrieve Data by exact name. */
  public async get(name: Name): Promise<Data|undefined> {
    let record: Record;
    try { record = await this.db.get(name); }
    catch (err) {
      /* istanbul ignore else */
      if (err.notFound) { return undefined; }
      /* istanbul ignore next */
      throw err;
    }

    const { data, expireTime } = record;
    return isExpired(expireTime) ? undefined : data;
  }

  /** Find Data that satisfies Interest. */
  public async find(interest: Interest): Promise<Data|undefined> {
    const prefix = ImplicitDigest.strip(interest.name);
    const it = filter(filterExpired(false), this.iterRecords(prefix));
    for await (const { data } of it) {
      if (await canSatisfy(interest, data)) { return data; }
    }
    return undefined;
  }

  /** Start an update transaction. */
  public tx(): Transaction {
    return new Transaction(this.db, this);
  }

  /** Insert one or more Data packets. */
  public insert(...pkts: Data[]): Promise<void>;

  /** Insert one or more Data packets with given options. */
  public insert(opts: InsertOptions, ...pkts: Data[]): Promise<void>;

  /** Insert a Data packet with given options. */
  public insert(data: Data, opts?: InsertOptions): Promise<void>;

  public insert(arg1: Data|InsertOptions, arg2?: Data|InsertOptions, ...pkts: Data[]): Promise<void> {
    let opts: InsertOptions|undefined;
    if (arg2 instanceof Data) { pkts.unshift(arg2); } else { opts = arg2; }
    if (arg1 instanceof Data) { pkts.unshift(arg1); } else { opts = arg1; }

    const tx = this.tx();
    for (const pkt of pkts) {
      tx.insert(pkt, opts);
    }
    return tx.commit();
  }

  /** Delete Data packets with given names. */
  public delete(...names: ReadonlyArray<Name>): Promise<void> {
    const tx = this.tx();
    for (const name of names) {
      tx.delete(name);
    }
    return tx.commit();
  }

  /** Delete all expired records. */
  public async clearExpired(): Promise<void> {
    const tx = this.tx();
    const it = filter(filterExpired(true), this.iterRecords());
    for await (const { name } of it) {
      tx.delete(name);
    }
    return tx.commit();
  }
}

type InsertOptions = Pick<Record, "expireTime">;

type Diff = ["insert"|"delete", Name];

/** DataStore update transaction. */
export class Transaction {
  private readonly timestamp = Date.now();
  private readonly chain: DbChain;
  private readonly diffs = new Map<string, Diff>();
  private encodePromises = [] as Array<Promise<void>>;
  private encodeError?: Error;

  constructor(private readonly db: Db, private readonly store: DataStore) {
    this.chain = this.db.batch();
  }

  /** Insert a Data packet. */
  public insert(data: Data, opts: InsertOptions = {}): this {
    this.encodePromises.push(
      this.insertImpl(data, opts).catch((err) => this.encodeError = err)
    );
    return this;
  }

  private async insertImpl(data: Data, opts: InsertOptions): Promise<void> {
    const record = {
      ...opts,
      insertTime: this.timestamp,
    } as Omit<Record, "name"|"data">;

    const json = new TextEncoder().encode(JSON.stringify(record));
    const encoder = new Encoder();
    encoder.prependRoom(json.byteLength).set(json);

    try {
      const wire = Data.getWire(data);
      encoder.prependRoom(wire.byteLength).set(wire);
    } catch {
      await data[LLSign.PROCESS]();
      encoder.encode(data);
    }

    const buf = encoder.output;
    record.encodedBuffer = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);

    this.chain.put(data.name, record as Record);
    this.diffs.set(toHex(data.name.value), ["insert", data.name]);
  }

  /** Delete a Data packet. */
  public delete(name: Name): this {
    this.chain.del(name);
    this.diffs.set(toHex(name.value), ["delete", name]);
    return this;
  }

  /** Commit the transaction. */
  public async commit(): Promise<void> {
    await Promise.all(this.encodePromises);
    if (this.encodeError) { throw this.encodeError; }

    if (this.store.listenerCount("insert") + this.store.listenerCount("delete") === 0) {
      await this.chain.write();
    } else {
      await this.store.mutex(() => this.commitWithDiff());
    }
  }

  private async commitWithDiff() {
    const changes = await collect(pipeline(
      () => this.diffs.values(),
      transform(8, async (diff) => {
        const [act, name] = diff;
        let exists = true;
        try { await this.db.get(name); }
        catch { exists = false; }
        return (exists ? act === "delete" : act === "insert") ? diff : undefined;
      }),
      filter((diff): diff is Diff => typeof diff !== "undefined"),
    ));

    await this.chain.write();

    for (const [act, name] of changes) {
      this.store.emit(act, name);
    }
  }
}
