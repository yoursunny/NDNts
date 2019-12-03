import { Data, Name } from "@ndn/packet";
import { LevelUpChain } from "levelup";

import { Record } from "./db";

export interface InsertOptions {
  /** If specified, record will expire at given timestamp. */
  expireTime?: number;
}

/** DataStore update transaction. */
export class Transaction {
  private readonly timestamp = Date.now();

  constructor(private readonly chain: LevelUpChain<Name, Record>) {
  }

  /** Insert a Data packet. */
  public insert(data: Data, opts: InsertOptions = {}): this {
    this.chain.put(data.name, {
      data,
      insertTime: this.timestamp,
      ...opts,
    });
    return this;
  }

  /** Delete a Data packet. */
  public delete(name: Name): this {
    this.chain.del(name);
    return this;
  }

  /** Commit the transaction. */
  public async commit(): Promise<void> {
    await this.chain.write();
  }
}
