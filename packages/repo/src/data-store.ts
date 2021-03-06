import { Data, ImplicitDigest, Interest, Name } from "@ndn/packet";
import { DataStore as S } from "@ndn/repo-api";
import { Encoder, toHex, toUtf8 } from "@ndn/tlv";
import type { AbstractLevelDOWN } from "abstract-leveldown";
import { EventEmitter } from "events";
import type { NotFoundError } from "level-errors";
import { collect, filter, fromStream, map, pipeline, transform } from "streaming-iterables";
import throat from "throat";
import type TypedEmitter from "typed-emitter";

import { Db, DbChain, filterExpired, isExpired, openDb, Record } from "./db";

interface Events {
  /** Emitted when a new record is inserted. */
  insert: (name: Name) => void;
  /** Emitted when an existing record is deleted. */
  delete: (name: Name) => void;
}

/** Data packet storage based on LevelDB or other abstract-leveldown store. */
export class DataStore extends (EventEmitter as new() => TypedEmitter<Events>)
  implements S.Close, S.ListNames, S.ListData, S.Get, S.Find, S.Insert<InsertOptions>, S.Delete {
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
    const it = fromStream<{ key: Name; value: Record }>(
      this.db.createReadStream(prefix ? { gte: prefix } : undefined));
    for await (const { key: name, value: record } of it) {
      if (prefix?.isPrefixOf(name) === false) {
        break;
      }
      Object.defineProperty(record, "name", { value: name });
      yield record;
    }
  }

  /** List Data names, optionally filtered by name prefix. */
  public listNames(prefix?: Name): AsyncIterable<Name> {
    return pipeline(
      () => this.iterRecords(prefix),
      filter(filterExpired(false)),
      map(({ name }) => name),
    );
  }

  /** List Data packets, optionally filtered by name prefix. */
  public listData(prefix?: Name): AsyncIterable<Data> {
    return pipeline(
      () => this.iterRecords(prefix),
      filter(filterExpired(false)),
      map(({ data }) => data),
    );
  }

  /** Retrieve Data by exact name. */
  public async get(name: Name): Promise<Data | undefined> {
    let record: Record;
    try {
      record = await this.db.get(name);
    } catch (err: unknown) {
      /* istanbul ignore else */
      if ((err as NotFoundError).notFound) {
        return undefined;
      }
      /* istanbul ignore next */
      throw err;
    }

    const { data, expireTime } = record;
    return isExpired(expireTime) ? undefined : data;
  }

  /** Find Data that satisfies Interest. */
  public async find(interest: Interest): Promise<Data | undefined> {
    const prefix = ImplicitDigest.strip(interest.name);
    const it = filter(filterExpired(false), this.iterRecords(prefix));
    for await (const { data } of it) {
      if (await data.canSatisfy(interest)) {
        return data;
      }
    }
    return undefined;
  }

  /** Start an update transaction. */
  public tx(): Transaction {
    return new Transaction(this.db, this);
  }

  /** Insert one or more Data packets. */
  public async insert(...args: S.Insert.Args<InsertOptions>): Promise<void> {
    const { opts, pkts } = S.Insert.parseArgs<InsertOptions>(args);
    const tx = this.tx();
    for await (const pkt of pkts) {
      tx.insert(pkt, opts);
    }
    return tx.commit();
  }

  /** Delete Data packets with given names. */
  public delete(...names: Name[]): Promise<void> {
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

type Diff = ["insert" | "delete", Name];

/** DataStore update transaction. */
export class Transaction {
  private readonly timestamp = Date.now();
  private readonly chain: DbChain;
  private readonly diffs?: Map<string, Diff>;
  private encodePromises = [] as Array<Promise<void>>;
  private encodeError?: Error;

  constructor(private readonly db: Db, private readonly store: DataStore) {
    this.chain = this.db.batch();
    if (this.store.listenerCount("insert") + this.store.listenerCount("delete") > 0) {
      this.diffs = new Map<string, Diff>();
    }
  }

  /** Insert a Data packet. */
  public insert(data: Data, opts: InsertOptions = {}): this {
    this.encodePromises.push((async () => {
      try {
        await this.insertImpl(data, opts);
      } catch (err: unknown) {
        // TODO AggregateError
        this.encodeError = err as Error;
      }
    })());
    return this;
  }

  private async insertImpl(data: Data, opts: InsertOptions): Promise<void> {
    const record: Omit<Record, "name" | "data"> = {
      ...opts,
      insertTime: this.timestamp,
    };

    const json = toUtf8(JSON.stringify(record));
    const encoder = new Encoder();
    encoder.prependRoom(json.byteLength).set(json);
    encoder.encode(data);

    const buf = encoder.output;
    record.encodedBuffer = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);

    this.chain.put(data.name, record as Record);
    this.diffs?.set(toHex(data.name.value), ["insert", data.name]);
  }

  /** Delete a Data packet. */
  public delete(name: Name): this {
    this.chain.del(name);
    this.diffs?.set(toHex(name.value), ["delete", name]);
    return this;
  }

  /** Commit the transaction. */
  public async commit(): Promise<void> {
    await Promise.all(this.encodePromises);
    if (this.encodeError) {
      throw this.encodeError;
    }

    if (this.diffs) {
      await this.store.mutex(() => this.commitWithDiff());
    } else {
      await this.chain.write();
    }
  }

  private async commitWithDiff() {
    const changes = await collect(pipeline(
      () => this.diffs!.values(),
      transform(8, async (diff) => {
        const [act, name] = diff;
        let exists = true;
        try {
          await this.db.get(name);
        } catch {
          exists = false;
        }
        return (exists ? act === "delete" : act === "insert") ? diff : undefined;
      }),
      filter((diff): diff is Diff => diff !== undefined),
    ));

    await this.chain.write();

    for (const [act, name] of changes) {
      this.store.emit(act, name);
    }
  }
}
