import type { ProducerHandler } from "@ndn/endpoint";
import { PrivateKey, theDigestKey } from "@ndn/keychain";
import { Data, Interest, Name } from "@ndn/packet";
import assert from "minimalistic-assert";
import pDefer from "p-defer";
import { getIterator } from "streaming-iterables";

import { defaultSegmentConvention, SegmentConvention } from "../convention";
import type { Chunk, ChunkSource } from "./chunk-source/mod";

interface DataProducerOptions {
  /**
   * Choose a segment number naming convention.
   * Default is Segment from @ndn/naming-convention2 package.
   */
  segmentNumConvention?: SegmentConvention;

  /**
   * Data ContentType.
   * @default 0
   */
  contentType?: number;

  /**
   * Data FreshnessPeriod (in milliseconds).
   * @default 60000
   */
  freshnessPeriod?: number;

  /**
   * A private key to sign Data.
   * Default is SHA256 digest.
   */
  signer?: PrivateKey;
}

/** Produce Data for requested segment. */
export abstract class DataProducer {
  segmentNumConvention: SegmentConvention;
  contentType: ReturnType<typeof Data["ContentType"]>;
  freshnessPeriod: ReturnType<typeof Data["FreshnessPeriod"]>;
  signer: PrivateKey;

  constructor(protected readonly source: ChunkSource, protected readonly prefix: Name,
      {
        segmentNumConvention = defaultSegmentConvention,
        contentType = 0,
        freshnessPeriod = 60000,
        signer = theDigestKey,
      }: DataProducerOptions = {}) {
    this.segmentNumConvention = segmentNumConvention;
    this.contentType = Data.ContentType(contentType);
    this.freshnessPeriod = Data.FreshnessPeriod(freshnessPeriod);
    this.signer = signer;
  }

  public processInterest: ProducerHandler = async (interest: Interest): Promise<Data|false> => {
    const segmentNum = this.parseInterest(interest);
    const data = await this.getData(segmentNum);
    if (!data) {
      return false;
    }
    return data;
  };

  private parseInterest({ name, canBePrefix }: Interest): number {
    if (this.prefix.length + 1 === name.length && this.prefix.isPrefixOf(name)) {
      const lastComp = name.at(-1);
      if (this.segmentNumConvention.match(lastComp)) {
        return this.segmentNumConvention.parse(name.at(-1));
      }
      throw new Error("invalid Interest name");
    }

    if (canBePrefix && name.isPrefixOf(this.prefix)) {
      return 0;
    }

    throw new Error("invalid Interest name");
  }

  protected async makeData({ i, final, payload }: Chunk): Promise<Data> {
    const data = new Data(
      this.prefix.append(this.segmentNumConvention, i),
      this.contentType,
      this.freshnessPeriod,
      payload,
    );
    if (typeof final === "number") {
      data.finalBlockId = this.segmentNumConvention.create(final);
    }
    await this.signer.sign(data);
    return data;
  }

  protected abstract getData(i: number): Promise<Data|undefined>;

  public close(): void {
    // no-op in base class
  }
}

interface SequentialDataProducerOptions extends DataProducerOptions {
  /**
   * How many chunks behind latest request to store in buffer.
   *
   * After processing an Interest requesting segment `i`, subsequent Interests requesting
   * segment before `i - bufferBehind` cannot be answered.
   *
   * A larger number or even `Infinity` allows answering Interests requesting early segments,
   * at the cost of buffering many generated packets in memory.
   * A smaller number reduces memory usage, at the risk of not being able to answer some Interests,
   * which would become a problem in the presence of multiple consumers.
   *
   * @default Infinity
   */
  bufferBehind?: number;

  /**
   * How many chunks ahead of latest request to store in buffer.
   *
   * A larger number can reduce latency of fulfilling Interests if ChunkSource is slow.
   * A smaller number reduces memory usage.
   *
   * @default 16
   */
  bufferAhead?: number;
}

/** Read from a sequential ChunkSource, and produce Data into a buffer. */
class SequentialDataProducer extends DataProducer {
  private requested = -1;
  private final = Infinity;
  private readonly buffer = new Map<number, Data>();
  private readonly waitlist = new Map<number, pDefer.DeferredPromise<void>>();
  private pause?: pDefer.DeferredPromise<void>;
  private stop = pDefer<IteratorReturnResult<unknown>>();

  constructor(source: ChunkSource, prefix: Name, opts: SequentialDataProducerOptions = {}) {
    super(source, prefix, opts);
    this.produce(opts);
  }

  public async getData(i: number) {
    if (i > this.final) {
      return undefined;
    }

    if (i > this.requested) {
      this.requested = i;
      this.pause?.resolve();
    }

    const data = this.buffer.get(i);
    if (data) {
      return data;
    }

    let wait = this.waitlist.get(i);
    if (!wait) {
      wait = pDefer();
      this.waitlist.set(i, wait);
    }
    await wait.promise;
    return this.buffer.get(i);
  }

  private async produce({ bufferBehind = Infinity, bufferAhead = 16 }: SequentialDataProducerOptions) {
    const iterator = getIterator(this.source.listChunks());
    let i = -1;
    for (;;) {
      const { done, value } = await Promise.race([iterator.next(), this.stop.promise]);
      if (done) {
        if (iterator.return) {
          iterator.return();
        }
        break;
      }

      const chunk: Chunk = value;
      ++i;
      assert(chunk.i === i, "unexpected chunk number");
      if (i > this.requested + bufferAhead) {
        this.pause = pDefer();
        await this.pause.promise;
        this.pause = undefined;
      }

      const data = await this.makeData(chunk);
      this.buffer.set(i, data);
      if (Number.isFinite(bufferBehind)) {
        this.buffer.delete(i - bufferBehind);
      }

      const w = this.waitlist.get(i);
      if (w) {
        this.waitlist.delete(i);
        w.resolve();
      }
    }
    this.final = i;
  }

  public close() {
    for (const w of this.waitlist.values()) {
      w.resolve();
    }

    this.pause?.resolve();
    this.stop.resolve({ done: true, value: undefined });
  }
}

type OnDemandDataProducerOptions = DataProducerOptions;

/** Produce Data from a ChunkSource that supports on-demand generation. */
class OnDemandDataProducer extends DataProducer {
  constructor(source: ChunkSource, prefix: Name, opts: OnDemandDataProducerOptions = {}) {
    super(source, prefix, opts);
    assert(typeof source.getChunk === "function");
  }

  public async getData(i: number) {
    const chunk = await this.source.getChunk!(i);
    if (!chunk) {
      return undefined;
    }
    return this.makeData(chunk);
  }
}

export namespace DataProducer {
  export type Options = SequentialDataProducerOptions | OnDemandDataProducerOptions;

  export function create(source: ChunkSource, prefix: Name, opts: Options = {}): DataProducer {
    if (typeof source.getChunk === "function") {
      return new OnDemandDataProducer(source, prefix, opts);
    }
    return new SequentialDataProducer(source, prefix, opts);
  }
}
