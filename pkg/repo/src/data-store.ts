import { type Data, ImplicitDigest, type Interest, type Name, NameMap } from "@ndn/packet";
import { DataStore as S } from "@ndn/repo-api";
import { assert, trackEventListener } from "@ndn/util";
import type { AbstractLevelDOWN } from "abstract-leveldown";
import type { NotFoundError } from "level-errors";
import { filter, map, pipeline } from "streaming-iterables";
import throat from "throat";
import { TypedEventTarget } from "typescript-event-target";

import { type Db, type DbChain, filterExpired, isExpired, openDb, type Record as DbRecord } from "./db";

type EventMap = {
  /** Emitted when a new record is inserted. */
  insert: DataStore.RecordEvent;
  /** Emitted when an existing record is deleted. */
  delete: DataStore.RecordEvent;
};

const kMaybeHaveEventListener = Symbol("@ndn/repo#DataStore.maybeHaveEventListener");

/** Data packet storage based on LevelDB or other abstract-leveldown store. */
export class DataStore extends TypedEventTarget<EventMap>
  implements AsyncDisposable, S.ListNames, S.ListData, S.Get, S.Find, S.Insert<DataStore.InsertOptions>, S.Delete {
  private readonly db: Db;
  public readonly mutex = throat(1);
  public readonly [kMaybeHaveEventListener] = trackEventListener(this);

  /**
   * Constructor.
   * @param db - An abstract-leveldown compatible store that supports Buffer as keys.
   */
  constructor(db: AbstractLevelDOWN) {
    super();
    this.db = openDb(db);
  }

  /** Close the store. */
  public [Symbol.asyncDispose](): Promise<void> {
    return this.db.close();
  }

  private async *iterRecords(prefix?: Name): AsyncGenerator<DbRecord> {
    const it = this.db.iterator(prefix ? { gte: prefix } : undefined);
    for await (const [name, record] of it as unknown as AsyncIterable<[Name, DbRecord]>) {
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
    let record: DbRecord;
    try {
      record = await this.db.get(name);
    } catch (err: unknown) {
      if ((err as NotFoundError).notFound) {
        return undefined;
      }
      /* c8 ignore next */
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

  /**
   * Insert one or more Data packets.
   * @see {@link Transaction.insert}
   */
  public async insert(...args: S.Insert.Args<DataStore.InsertOptions>): Promise<void> {
    const { opts, pkts } = S.Insert.parseArgs<DataStore.InsertOptions>(args);
    const tx = this.tx();
    for await (const pkt of pkts) {
      tx.insert(pkt, opts);
    }
    return tx.commit();
  }

  /**
   * Delete Data packets with given names.
   * @see {@link Transaction.delete}
   */
  public delete(...names: readonly Name[]): Promise<void> {
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
export namespace DataStore {
  /** {@link DataStore.insert} options. */
  export interface InsertOptions {
    expireTime?: number;
  }

  /** Packet record event. */
  export class RecordEvent extends Event {
    constructor(type: string, public readonly name: Name) {
      super(type);
    }
  }
}

/** DataStore update transaction. */
export class Transaction {
  private readonly timestamp = Date.now();
  private readonly chain: DbChain;
  private readonly diffs?: NameMap<keyof EventMap>;

  constructor(private readonly db: Db, private readonly store: DataStore) {
    this.chain = this.db.batch();
    const maybeHaveEventListener = this.store[kMaybeHaveEventListener] as Record<keyof EventMap, boolean>;
    if (maybeHaveEventListener.insert || maybeHaveEventListener.delete) {
      this.diffs = new NameMap();
    }
  }

  /** Insert a Data packet. */
  public insert(data: Data, opts: DataStore.InsertOptions = {}): this {
    const { name } = data;
    this.chain.put(name, {
      ...opts,
      insertTime: this.timestamp,
      data,
      name,
    });
    this.diffs?.set(name, "insert");
    return this;
  }

  /** Delete a Data packet. */
  public delete(name: Name): this {
    this.chain.del(name);
    this.diffs?.set(name, "delete");
    return this;
  }

  /** Commit the transaction. */
  public async commit(): Promise<void> {
    if (this.diffs) {
      await this.store.mutex(() => this.commitWithDiff());
    } else {
      await this.chain.write();
    }
  }

  private async commitWithDiff() {
    const requests = Array.from(this.diffs!);
    const oldRecords = await this.db.getMany(requests.map(([name]) => name));
    assert.equal(requests.length, oldRecords.length);

    await this.chain.write();

    for (const [i, [name, act]] of requests.entries()) {
      if (act === (oldRecords[i] === undefined ? "insert" : "delete")) {
        this.store.dispatchTypedEvent(act, new DataStore.RecordEvent(act, name));
      }
    }
  }
}
