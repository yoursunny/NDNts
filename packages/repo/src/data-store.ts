import { EventEmitter } from "node:events";

import { type Data, ImplicitDigest, type Interest, type Name, NameMap } from "@ndn/packet";
import { DataStore as S } from "@ndn/repo-api";
import { assert } from "@ndn/util";
import type { AbstractLevelDOWN } from "abstract-leveldown";
import type { NotFoundError } from "level-errors";
import { filter, map, pipeline } from "streaming-iterables";
import throat from "throat";
import type TypedEmitter from "typed-emitter";

import { type Db, type DbChain, filterExpired, isExpired, openDb, type Record } from "./db";

type Events = {
  /** Emitted when a new record is inserted. */
  insert: (name: Name) => void;
  /** Emitted when an existing record is deleted. */
  delete: (name: Name) => void;
};

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
    const it = this.db.iterator(prefix ? { gte: prefix } : undefined);
    for await (const [name, record] of it as unknown as AsyncIterable<[Name, Record]>) {
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

/** DataStore update transaction. */
export class Transaction {
  private readonly timestamp = Date.now();
  private readonly chain: DbChain;
  private readonly diffs?: NameMap<keyof Events>;

  constructor(private readonly db: Db, private readonly store: DataStore) {
    this.chain = this.db.batch();
    if (this.store.listenerCount("insert") + this.store.listenerCount("delete") > 0) {
      this.diffs = new NameMap<keyof Events>();
    }
  }

  /** Insert a Data packet. */
  public insert(data: Data, opts: InsertOptions = {}): this {
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
        this.store.emit(act, name);
      }
    }
  }
}
