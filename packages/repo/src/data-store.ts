import { canSatisfy, Data, ImplicitDigest, Interest, Name } from "@ndn/packet";
import { AbstractLevelDOWN } from "abstract-leveldown";
import { filter, fromStream, map, pipeline, writeToStream } from "streaming-iterables";

import { Db, filterExpired, isExpired, openDb, Record } from "./db";
import { InsertOptions, Transaction } from "./transaction";

/** Data packet storage based on LevelDB or other abstract-leveldown store. */
export class DataStore {
  private readonly db: Db;

  /**
   * Constructor.
   * @param db an abstract-leveldown compatible store. It must support Buffer as keys.
   */
  constructor(db: AbstractLevelDOWN) {
    this.db = openDb(db);
  }

  /** Close the store. */
  public close(): Promise<void> {
    return this.db.close();
  }

  private async *iterRecords(prefix?: Name): AsyncGenerator<Record> {
    const it = fromStream<Record>(this.db.createValueStream(prefix ? { gte: prefix } : undefined));
    for await (const record of it) {
      if (prefix?.isPrefixOf(record.data.name) === false) { break; }
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
      map(({ data: { name } }) => name),
    );
  }

  /** Retrieve Data by exact name. */
  public async get(name: Name): Promise<Data|undefined> {
    let record: Record;
    try { record = await this.db.get(name); }
    catch (err) {
      if (err.notFound) { return undefined; }
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
    return new Transaction(this.db.batch());
  }

  /** Insert one or more Data packets. */
  public insert(...pkts: [Data, ...Data[]]): Promise<void>;

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
    for await (const { data: { name } } of it) {
      tx.delete(name);
    }
    return tx.commit();
  }

  /** Export Data packets to a stream. */
  public archive(output: NodeJS.WritableStream, prefix?: Name): Promise<void> {
    return pipeline(
      () => this.iterRecords(prefix),
      filter(filterExpired(false)),
      map(({ data }) => Data.getWire(data)),
      writeToStream(output),
    );
  }
}
