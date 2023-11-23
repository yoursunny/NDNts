import type { L3Face } from "@ndn/l3face";
import type { Data } from "@ndn/packet";
import { CustomEvent } from "@ndn/util";
import { pushable } from "it-pushable";
import pDefer, { type DeferredPromise } from "p-defer";
import { consume, map } from "streaming-iterables";
import { TypedEventTarget } from "typescript-event-target";

import * as S from "./data-store";

interface InsertJob {
  pkts: AsyncIterable<Data>;
  defer: DeferredPromise<undefined>;
}

type EventMap = {
  error: CustomEvent<Error>;
};

/** Send packets to a bulk insertion target. */
export class BulkInsertInitiator extends TypedEventTarget<EventMap> implements S.Close, S.Insert {
  private readonly jobs = pushable<InsertJob>({ objectMode: true });
  private readonly faceTx: Promise<void>;

  /**
   * Constructor.
   * @param face bulk insertion target.
   *             RX side is ignored.
   *             Data packets are sent to its TX side, errors raise 'error' event.
   */
  constructor(face: L3Face) {
    super();
    consume(face.rx).catch(() => undefined);
    this.faceTx = face.tx(this.tx()).catch((err) => {
      this.dispatchTypedEvent("error", new CustomEvent("error", { detail: err }));
    });
  }

  /**
   * Finish insertion and close the target.
   * .insert() cannot be called after this.
   */
  public async close(): Promise<void> {
    this.jobs.end();
    await this.faceTx;
  }

  /**
   * Send packets to the target.
   *
   * A resolved Promise means the packets are scheduled for transmission.
   * It does not imply the target has received or accepted these packets.
   */
  public async insert(...args: S.Insert.Args<{}>): Promise<void> {
    const { pkts } = S.Insert.parseArgs<{}>(args);
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
