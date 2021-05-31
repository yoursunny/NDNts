import type { Data, Name } from "@ndn/packet";
import pushable from "it-pushable";
import assert from "minimalistic-assert";
import { map, writeToStream } from "streaming-iterables";

import { Fetcher } from "./fetcher";
import { Reorder } from "./reorder";

class FetchResult implements fetch.Result {
  constructor(private readonly name: Name, private readonly opts: fetch.Options) {}

  public count = 0;
  private unused = true;

  private makeFetcher() {
    assert(this.unused, "fetch.Result is already used");
    this.unused = false;
    return new Fetcher(this.name, this.opts);
  }

  public unordered() {
    const ctx = this.makeFetcher();
    const it = pushable<Data>();
    ctx.on("segment", (segNum, data) => {
      it.push(data);
      ++this.count;
    });
    ctx.on("end", () => it.end());
    ctx.on("error", (err) => it.end(err));
    return it;
  }

  private ordered() {
    const ctx = this.makeFetcher();
    const reorder = new Reorder<Data>(this.opts.segmentRange?.[0]);
    const it = pushable<Data>();
    ctx.on("segment", (segNum, data) => {
      const ordered = reorder.push(segNum, data);
      for (const data of ordered) {
        it.push(data);
        ++this.count;
      }
    });
    ctx.on("end", () => {
      assert(reorder.empty);
      it.end();
    });
    ctx.on("error", (err) => it.end(err));
    return it;
  }

  public chunks() {
    return map((data) => data.content, this.ordered());
  }

  public pipe(dest: NodeJS.WritableStream) {
    return writeToStream(dest, this.chunks());
  }

  private promise?: Promise<Uint8Array>;

  private async startPromise() {
    const chunks = [] as Uint8Array[];
    let totalLength = 0;
    for await (const chunk of this.chunks()) {
      chunks.push(chunk);
      totalLength += chunk.length;
    }

    const output = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    assert.equal(offset, totalLength);
    return output;
  }

  public then<R, J>(onfulfilled: ((value: Uint8Array) => R | PromiseLike<R>) | undefined | null,
      onrejected?: ((reason: any) => J | PromiseLike<J>) | undefined | null) {
    if (!this.promise) {
      this.promise = this.startPromise();
    }
    return this.promise.then(onfulfilled, onrejected);
  }

  public [Symbol.asyncIterator]() {
    return this.ordered()[Symbol.asyncIterator]();
  }
}

/** Fetch a segment object as AsyncIterable of payload. */
export function fetch(name: Name, opts: fetch.Options = {}): fetch.Result {
  return new FetchResult(name, opts);
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

    /** Number of segmented retrieved. */
    readonly count: number;
  }
}
