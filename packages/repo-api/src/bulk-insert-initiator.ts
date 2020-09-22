import { L3Face } from "@ndn/l3face";
import type { Data } from "@ndn/packet";
import pushable from "it-pushable";
import pDefer, { DeferredPromise } from "p-defer";
import { consume, map } from "streaming-iterables";

import * as S from "./data-store";

interface InsertJob {
  pkts: AsyncIterable<Data>;
  defer: DeferredPromise<undefined>;
}

/** Send packets to a bulk insertion target. */
export class BulkInsertInitiator implements S.Close, S.Insert {
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
  public async insert(...args: S.Insert.Args<never>): Promise<void> {
    const { pkts } = S.Insert.parseArgs(args);
    const job: InsertJob = {
      pkts,
      defer: pDefer(),
    };
    this.jobs.push(job);
    return job.defer.promise;
  }

  private async *tx(): AsyncIterable<{ l3: Data }> {
    for await (const job of this.jobs) {
      yield* map((data) => ({ l3: data }), job.pkts);
      job.defer.resolve();
    }
  }
}
