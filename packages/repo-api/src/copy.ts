import { Name } from "@ndn/packet";
import { batch, consume, pipeline, transform } from "streaming-iterables";

import * as S from "./data-store";

export interface CopyOptions {
  /** Number of packets per transaction. Default is 64. */
  batch?: number;

  /** Maximum parallel transactions. Default is 1. */
  parallel?: number;
}

function splitOptions(opts: any): [CopyOptions, any] {
  if (!opts) {
    return [{}, {}];
  }
  const {
    batch,
    parallel,
  } = opts;
  const insertOpts = opts;
  delete insertOpts.batch;
  delete insertOpts.parallel;
  return [{ batch, parallel }, insertOpts];
}

/**
 * Copy Data packets from source DataStore to destination DataStore.
 * @param src source DataStore.
 * @param prefix name prefix to select Data packets.
 * @param dst destination DataStore.
 * @param opts insert options and copy batching options.
 */
export async function copy<InsertOptions extends {} = never>(src: S.ListData, prefix: Name,
  dst: S.Insert<InsertOptions>, opts?: CopyOptions&InsertOptions): Promise<void>;
export async function copy<InsertOptions extends {} = never>(src: S.ListData,
  dst: S.Insert<InsertOptions>, opts?: CopyOptions&InsertOptions): Promise<void>;

export async function copy(src: S.ListData, arg2: any, arg3?: any, arg4?: any): Promise<void> {
  const [prefix, dst, opts]: [Name|undefined, S.Insert<any>, any] =
    arg2 instanceof Name ? [arg2, arg3, arg4] : [undefined, arg2, arg3];

  const [{
    batch: batchSize = 64,
    parallel = 1,
  }, insertOpts] = splitOptions(opts);

  return pipeline(
    () => src.listData(prefix),
    batch(batchSize),
    transform(parallel, (pkts) => dst.insert(insertOpts, ...pkts)),
    consume,
  );
}
