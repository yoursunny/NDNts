import { Data, Name } from "@ndn/packet";
import { LevelUpChain } from "levelup";

import { Record } from "./db";

export type InsertOptions = Omit<Record.Options, "insertTime">

/** DataStore update transaction. */
export class Transaction {
  private readonly timestamp = Date.now();

  constructor(private readonly chain: LevelUpChain<Name, Record>) {
  }

  /** Insert a Data packet. */
  public insert(data: Data, opts: InsertOptions = {}): this {
    this.chain.put(data.name, Record.fromData(data, {
      ...opts,
      insertTime: this.timestamp,
    }));
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
