import { Data, Name, NameLike } from "@ndn/packet";
import EventIterator from "event-iterator";
import assert from "minimalistic-assert";
import { collect, map, writeToStream } from "streaming-iterables";

import { Fetcher } from "./fetcher";
import { Reorder } from "./reorder";

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
      let resume: () => void | undefined;
      on("highWater", () => { resume = ctx.pause(); });
      on("lowWater", () => { resume?.(); });

      ctx.on("segment", push);
      ctx.on("end", stop);
      ctx.on("error", fail);
      return () => {
        resume?.();
        ctx.off("segment", push);
        ctx.off("end", stop);
        ctx.off("error", fail);
      };
    });
  }

  public unordered() {
    return map(({ data }) => data, this.startFetcher());
  }

  private async *ordered() {
    const reorder = new Reorder<Data>(this.opts.segmentRange?.[0]);
    for await (const { segNum, data } of this.startFetcher()) {
      const ordered = reorder.push(segNum, data);
      yield* ordered;
    }
    assert(reorder.empty);
  }

  public chunks() {
    return map((data) => data.content, this.ordered());
  }

  public pipe(dest: NodeJS.WritableStream) {
    return writeToStream(dest, this.chunks());
  }

  private async startPromise() {
    const chunks = await collect(this.chunks());
    const totalLength = chunks.map((chunk) => chunk.length).reduce((a, b) => a + b);
    const output = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    assert.equal(offset, totalLength);
    return output;
  }

  public then<R, J>(
      onfulfilled?: ((value: Uint8Array) => R | PromiseLike<R>) | null,
      onrejected?: ((reason: any) => J | PromiseLike<J>) | null,
  ) {
    this.promise ??= this.startPromise();
    // eslint-disable-next-line promise/prefer-await-to-then
    return this.promise.then(onfulfilled, onrejected);
  }

  public [Symbol.asyncIterator]() {
    return this.ordered()[Symbol.asyncIterator]();
  }
}

/** Fetch a segment object as AsyncIterable of payload. */
export function fetch(name: NameLike, opts: fetch.Options = {}): fetch.Result {
  return new FetchResult(new Name(name), opts);
}

export namespace fetch {
  export type Options = Fetcher.Options;

  /**
   * Return type of fetch() function.
   *
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
    unordered: () => AsyncIterable<Data>;

    /** Iterate over payload chunks in segment number order. */
    chunks: () => AsyncIterable<Uint8Array>;

    /** Write all chunks to the destination stream. */
    pipe: (dest: NodeJS.WritableStream) => Promise<void>;

    /** Number of segments retrieved so far. */
    readonly count: number;
  }
}
