import { type Data, Name, type NameLike } from "@ndn/packet";
import { assert, concatBuffers, Reorder } from "@ndn/util";
import EventIterator from "event-iterator";
import { collect, map, type WritableStreamish, writeToStream } from "streaming-iterables";
import type { Promisable } from "type-fest";

import { Fetcher } from "./fetcher";

class FetchResult implements fetch.Result {
  constructor(private readonly name: Name, private readonly opts: fetch.Options) {}

  public get count(): number { return this.ctx?.count ?? 0; }
  private ctx?: Fetcher;
  private promise?: Promise<Uint8Array>;

  private startFetcher() {
    assert(!this.ctx, "fetch.Result is already used");
    const ctx = new Fetcher(this.name, this.opts);
    this.ctx = ctx;
    return new EventIterator<Fetcher.SegmentData>(({ push, stop, fail, on }) => {
      let resume: (() => void) | undefined;
      on("highWater", () => { resume = ctx.pause(); });
      on("lowWater", () => { resume?.(); });

      const abort = new AbortController();
      ctx.addEventListener("segment", push, { signal: abort.signal });
      ctx.addEventListener("end", stop, { signal: abort.signal });
      ctx.addEventListener("error", ({ detail }) => fail(detail), { signal: abort.signal });
      return () => {
        resume?.();
        abort.abort();
      };
    });
  }

  public unordered() {
    return map(
      ({ data, segNum }) => Object.assign(data, { segNum }),
      this.startFetcher(),
    );
  }

  private async *ordered() {
    const reorder = new Reorder<Data>(this.opts.segmentRange?.[0]);
    for await (const { segNum, data } of this.startFetcher()) {
      reorder.push(segNum, data);
      yield* reorder.shift();
    }
    assert(reorder.empty, `${reorder.size} leftover segments`);
  }

  public chunks() {
    return map((data) => data.content, this.ordered());
  }

  public pipe(dest: WritableStreamish) {
    return writeToStream(dest, this.chunks());
  }

  private async startPromise() {
    const chunks = await collect(this.chunks());
    return concatBuffers(chunks);
  }

  // eslint-disable-next-line unicorn/no-thenable
  public then<R, J>(
      onfulfilled?: ((value: Uint8Array) => Promisable<R>) | null,
      onrejected?: ((reason: any) => Promisable<J>) | null,
  ) {
    this.promise ??= this.startPromise();
    return this.promise.then(onfulfilled, onrejected);
  }

  public [Symbol.asyncIterator]() {
    return this.ordered()[Symbol.asyncIterator]();
  }
}

/**
 * Fetch a segmented object.
 *
 * @remarks
 * This function does not perform version discovery. If the segmented object is versioned, `name`
 * must include the version component. You can perform version discovery with
 * {@link discoverVersion} function and pass its result to this function for fetching the
 * versioned and segmented object.
 */
export function fetch(name: NameLike, opts: fetch.Options = {}): fetch.Result {
  return new FetchResult(Name.from(name), opts);
}

export namespace fetch {
  /** {@link fetch} options. */
  export interface Options extends Fetcher.Options {}

  /**
   * Return type of {@link fetch} function.
   *
   * @remarks
   * Fetch output may be accessed in one of several formats:
   * - `await result` resolves to the reassembled object as Uint8Array.
   * - `for await (const packet of result)` iterates over Data packets in segment number order.
   * - more formats available as methods.
   *
   * Result is lazy. Fetching starts when an output format is accessed.
   * You may only access one output format on a Result instance.
   * Formats other than `await result` can be accessed only once.
   */
  export interface Result extends PromiseLike<Uint8Array>, AsyncIterable<Data> {
    /** Iterate over Data packets as they arrive, not sorted in segment number order. */
    unordered: () => AsyncIterable<Data & { readonly segNum: number }>;

    /** Iterate over payload chunks in segment number order. */
    chunks: () => AsyncIterable<Uint8Array>;

    /** Write all chunks to the destination stream. */
    pipe: (dest: WritableStreamish) => Promise<void>;

    /** Number of segments retrieved so far. */
    readonly count: number;
  }
}
