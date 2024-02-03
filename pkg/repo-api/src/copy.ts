import { Name } from "@ndn/packet";
import { batch, consume, pipeline, transform } from "streaming-iterables";

import type * as S from "./data-store";

/** {@link copy} options. */
export interface CopyOptions {
  /**
   * Number of packets per transaction.
   * @defaultValue 64
   */
  batch?: number;

  /**
   * Maximum parallel transactions.
   * @defaultValue 1
   */
  parallel?: number;
}

/**
 * Copy Data packets from source DataStore to destination DataStore.
 * @param src - Source DataStore.
 * @param prefix - Filter Data packets by name prefix.
 * @param dst - Destination DataStore.
 * @param opts - Insert options and copy batching options.
 * @returns Number of Data packets copied.
 */
export async function copy<InsertOptions extends {} = never>(src: S.ListData, prefix: Name,
  dst: S.Insert<InsertOptions>, opts?: CopyOptions & InsertOptions): Promise<number>;
export async function copy<InsertOptions extends {} = never>(src: S.ListData,
  dst: S.Insert<InsertOptions>, opts?: CopyOptions & InsertOptions): Promise<number>;

export async function copy(src: S.ListData, arg2: any, arg3?: any, arg4?: any): Promise<number> {
  const [prefix, dst, opts = {}]: [Name | undefined, S.Insert<any>, any] =
    arg2 instanceof Name ? [arg2, arg3, arg4] : [undefined, arg2, arg3];
  const {
    batch: batchSize = 64,
    parallel = 1,
  } = opts;
  const insertOpts = { ...opts };
  delete insertOpts.batch;
  delete insertOpts.parallel;

  let n = 0;
  await pipeline(
    () => src.listData(prefix),
    batch(batchSize),
    transform(parallel, async (pkts) => {
      await dst.insert(insertOpts, ...pkts);
      n += pkts.length;
    }),
    consume,
  );
  return n;
}
