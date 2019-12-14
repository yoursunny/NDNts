import { L3Face } from "@ndn/l3face";
import { Data } from "@ndn/packet";
import { batch, consume, filter, pipeline, transform } from "streaming-iterables";

import { DataStore } from "./mod";

export class BulkInserter {
  private readonly batchSize: number;
  private readonly parallelism: number;

  constructor(private readonly store: DataStore, opts: BulkInserter.Options = {}) {
    this.batchSize = opts.batch ?? 64;
    this.parallelism = opts.parallel ?? 1;
  }

  public accept(face: L3Face): Promise<void> {
    // eslint-disable-next-line require-yield
    face.tx((async function*() {
      await new Promise((r) => face.once("down", r));
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
