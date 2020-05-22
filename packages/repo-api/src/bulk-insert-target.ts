import { L3Face } from "@ndn/l3face";
import { Data } from "@ndn/packet";
import { batch, consume, filter, pipeline, transform } from "streaming-iterables";

import type { DataStore } from "./data-store";

/** Accept packets into DataStore via bulk insertion protocol. */
export class BulkInsertTarget {
  private readonly batchSize: number;
  private readonly parallelism: number;

  constructor(private readonly store: Pick<DataStore, "insert">, {
    batch = 64,
    parallel = 1,
  }: BulkInserter.Options = {}) {
    this.batchSize = batch;
    this.parallelism = parallel;
  }

  public accept(face: L3Face): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises, require-yield
    face.tx((async function*() {
      await Promise.race([
        new Promise((r) => face.once("down", r)),
        new Promise((r) => face.once("close", r)),
      ]);
    })());
    return pipeline(
      () => face.rx,
      filter((pkt): pkt is Data => pkt instanceof Data),
      batch(this.batchSize),
      transform(this.parallelism, (pkts) => this.store.insert(...pkts)),
      consume,
    );
  }
}

export namespace BulkInserter {
  export interface Options {
    /** Number of packets per transaction. Default is 64. */
    batch?: number;

    /** Maximum parallel transactions. Default is 1. */
    parallel?: number;
  }
}
