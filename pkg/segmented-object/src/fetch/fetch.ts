import type { ConsumerOptions, Endpoint } from "@ndn/endpoint";
import { type Data, Name, type NameLike, type Verifier } from "@ndn/packet";
import { assert, concatBuffers, Reorder } from "@ndn/util";
// import EventIterator from "event-iterator";
import { collect, map, parallelMap, type WritableStreamish, writeToStream } from "streaming-iterables";
import type { Promisable } from "type-fest";

import { type SegData, UnverifiedFetcher, type UnverifiedFetcherOptions } from "./unverified";

class FetchResult implements fetch.Result {
  constructor(private readonly name: Name, private readonly opts: fetch.Options) {}

  public get count(): number { return this.uvf?.count ?? 0; }
  private uvf?: UnverifiedFetcher;
  private promise?: Promise<Uint8Array>;

  private startFetcher(): AsyncIterable<SegData> {
    assert(!this.uvf, "fetch.Result is already used");
    const opts = {
      ...this.opts.endpoint?.cOpts, // eslint-disable-line etc/no-deprecated
      ...this.opts.cOpts,
      ...this.opts,
    };
    this.uvf = new UnverifiedFetcher(this.name, opts);
    return parallelMap(16, async ({ seg, data }) => {
      await opts.verifier?.verify(data);
      return { seg, data };
    }, this.uvf.fetch());
  }

  public unordered() {
    return map(
      ({ data, seg: segNum }) => Object.assign(data, { segNum }),
      this.startFetcher(),
    );
  }

  private async *ordered() {
    const reorder = new Reorder<Data>(this.opts.segmentRange?.[0]);
    for await (const { seg: segNum, data } of this.startFetcher()) {
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
  export interface Options extends UnverifiedFetcherOptions {
    /**
     * Inherit fetcher options from Endpoint consumer options.
     * @deprecated Specify `.cOpts`.
     */
    endpoint?: Endpoint;

    /**
     * Inherit fetcher options from consumer options.
     *
     * @remarks
     * These options are inherited if the corresponding fetcher option is unset:
     * - `describe`
     * - `fw`
     * - `modifyInterest`
     * - `signal`
     * - `verifier`
     *
     * Other options cannot be inherited, notably:
     * - `retx`
     */
    cOpts?: ConsumerOptions;

    /**
     * Data verifier.
     * @defaultValue noopSigning
     */
    verifier?: Verifier;
  }

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
