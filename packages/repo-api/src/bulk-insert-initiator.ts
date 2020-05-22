import { L3Face } from "@ndn/l3face";
import type { Data } from "@ndn/packet";
import pushable from "it-pushable";
import pDefer, { DeferredPromise } from "p-defer";
import { consume } from "streaming-iterables";

import type { DataStore } from "./data-store";

interface InsertJob {
  pkts: Data[];
  promise: DeferredPromise<undefined>;
}

/** Send packets to a bulk insertion target. */
export class BulkInsertInitiator implements Pick<DataStore, "close"|"insert"> {
  private readonly jobs = pushable<InsertJob>();
  private readonly faceTx: Promise<void>;

  constructor(face: L3Face) {
    consume(face.rx).catch(() => undefined);
    this.faceTx = face.tx(this.tx()).catch(() => undefined);
  }

  public async close() {
    this.jobs.end();
    await this.faceTx;
  }

  /**
   * Send packets to the target.
   *
   * A resolved Promise means the packets are scheduled for transmission.
   * It does not imply the target has received or accepted these packets.
   */
  public insert(...pkts: Data[]): Promise<void> {
    const job: InsertJob = {
      pkts,
      promise: pDefer(),
    };
    this.jobs.push(job);
    return job.promise.promise;
  }

  private async *tx(): AsyncIterable<Data> {
    for await (const job of this.jobs) {
      yield* job.pkts;
      job.promise.resolve();
    }
  }
}
