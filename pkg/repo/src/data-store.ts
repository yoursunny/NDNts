import { type Data, ImplicitDigest, type Interest, type Name, NameMap } from "@ndn/packet";
import { DataStore as S } from "@ndn/repo-api";
import { assert, lock, trackEventListener } from "@ndn/util";
import { filter, map, pipeline } from "streaming-iterables";
import { TypedEventTarget } from "typescript-event-target";
import { Mutex } from "wait-your-turn";

import { AbstractLevelOptions, type Db, type DbBatch, type DbCtor, type DbOpener, filterExpired, isExpired, type Value } from "./db";

type EventMap = {
  /** Emitted when a new record is inserted. */
  insert: DataStore.RecordEvent;
  /** Emitted when an existing record is deleted. */
  delete: DataStore.RecordEvent;
};

const kMaybeHaveEventListener = Symbol("@ndn/repo#DataStore.maybeHaveEventListener");

/**
 * Data packet storage based on LevelDB or other abstract-level compatible key-value database.
 *
 * @remarks
 * Create an instance with {@link makeInMemoryDataStore} or {@link makePersistentDataStore}.
 */
export class DataStore extends TypedEventTarget<EventMap>
  implements AsyncDisposable, S.ListNames, S.ListData, S.Get, S.Find, S.Insert<DataStore.InsertOptions>, S.Delete {
  /**
   * Create DataStore from an abstract-level opener function.
   * @param open - Function that opens an abstract-level compatible key-value database with
   * the given options.
   */
  public static create(open: DbOpener): Promise<DataStore>;

  /**
   * Create DataStore from an abstract-level subclass constructor.
   * @param ctor - Subclass of abstract-level that accepts options as its last parameter.
   * @param args - `ctor` arguments; last should be options object.
   */
  public static create<const A extends unknown[], const O extends {}>(
    ctor: DbCtor<A, O>, ...args: [...A, O]
  ): Promise<DataStore>;

  public static async create<A extends unknown[], O extends {}>(
      fn: DbOpener | DbCtor<A, O>,
      ...args: [...A, O] | []
  ) {
    let db: Db;
    if (args.length === 0) {
      db = await (fn as DbOpener)(AbstractLevelOptions);
    } else {
      db = new (fn as DbCtor<A, O>)(
        ...(args.slice(0, -1) as A),
        { ...(args.at(-1) as O), ...AbstractLevelOptions },
      );
    }
    await db.open();
    return new DataStore(db);
  }

  private constructor(private readonly db: Db) {
    super();
  }

  public readonly mutex = new Mutex();
  public readonly [kMaybeHaveEventListener] = trackEventListener(this);

  /** Close the store. */
  public [Symbol.asyncDispose](): Promise<void> {
    return this.db.close();
  }

  private async *iterRecords(prefix?: Name): AsyncGenerator<Value> {
    const range = prefix ? { gte: prefix } : {};
    const it = this.db.iterator(range);
    for await (const [name, record] of it as unknown as AsyncIterable<[Name, Value]>) {
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
    const record = await this.db.get(name);
    return !record || isExpired(record) ? undefined : record.data;
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
  public async delete(...names: readonly Name[]): Promise<void> {
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
  private readonly batch: DbBatch;
  private readonly diffs?: NameMap<keyof EventMap>;

  constructor(private readonly db: Db, private readonly store: DataStore) {
    assert(this.db.status === "open");
    this.batch = this.db.batch();
    const maybeHaveEventListener = this.store[kMaybeHaveEventListener] as Record<keyof EventMap, boolean>;
    if (maybeHaveEventListener.insert || maybeHaveEventListener.delete) {
      this.diffs = new NameMap();
    }
  }

  /** Insert a Data packet. */
  public insert(data: Data, opts: DataStore.InsertOptions = {}): this {
    const { name } = data;
    this.batch.put(name, {
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
    this.batch.del(name);
    this.diffs?.set(name, "delete");
    return this;
  }

  /** Commit the transaction. */
  public async commit(): Promise<void> {
    if (this.diffs) {
      // @ts-expect-error https://github.com/microsoft/TypeScript/issues/55538
      using locked = await lock(this.store.mutex);
      await this.commitWithDiff();
    } else {
      await this.batch.write();
    }
  }

  private async commitWithDiff() {
    const requests = Array.from(this.diffs!);
    const oldRecords = await this.db.hasMany(requests.map(([name]) => name));
    assert(requests.length === oldRecords.length);

    await this.batch.write();

    for (const [i, [name, act]] of requests.entries()) {
      if (act === (oldRecords[i] ? "delete" : "insert")) {
        this.store.dispatchTypedEvent(act, new DataStore.RecordEvent(act, name));
      }
    }
  }
}
