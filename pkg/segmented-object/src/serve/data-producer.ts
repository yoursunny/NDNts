import type { ProducerHandler } from "@ndn/endpoint";
import { Data, digestSigning, type Interest, type Name, type Signer } from "@ndn/packet";
import { assert, getOrInsert } from "@ndn/util";
import { getIterator } from "streaming-iterables";

import { defaultSegmentConvention, type SegmentConvention } from "../convention";
import type { Chunk, ChunkSource } from "./chunk-source/mod";

/**
 * Produce Data for requested segment.
 * @see {@link DataProducer.create}
 */
export abstract class DataProducer {
  private readonly segmentNumConvention: SegmentConvention;
  private readonly contentType: ReturnType<typeof Data["ContentType"]>;
  private readonly freshnessPeriod: ReturnType<typeof Data["FreshnessPeriod"]>;
  private readonly signer: Signer;

  protected constructor(protected readonly source: ChunkSource, protected readonly prefix: Name,
      {
        segmentNumConvention = defaultSegmentConvention,
        contentType = 0,
        freshnessPeriod = 60000,
        signer = digestSigning,
      }: DataProducer.Options) {
    this.segmentNumConvention = segmentNumConvention;
    this.contentType = Data.ContentType(contentType);
    this.freshnessPeriod = Data.FreshnessPeriod(freshnessPeriod);
    this.signer = signer;
  }

  public async *listData(): AsyncIterable<Data> {
    for (let i = 0; ; ++i) {
      const data = await this.getData(i);
      if (!data) {
        break;
      }
      yield data;
    }
  }

  public readonly processInterest: ProducerHandler = (interest: Interest): Promise<Data | undefined> => {
    const segmentNum = this.parseInterest(interest);
    return this.getData(segmentNum);
  };

  private parseInterest({ name, canBePrefix }: Interest): number {
    if (this.prefix.length + 1 === name.length && this.prefix.isPrefixOf(name)) {
      const lastComp = name.at(-1);
      if (this.segmentNumConvention.match(lastComp)) {
        return this.segmentNumConvention.parse(name.at(-1));
      }
    } else if (canBePrefix && name.isPrefixOf(this.prefix)) {
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

  protected abstract getData(i: number): Promise<Data | undefined>;

  public close(): void {
    this.source.close?.();
  }
}

/** Read from a sequential ChunkSource, and produce Data into a buffer. */
class SequentialDataProducer extends DataProducer {
  private requested = -1;
  private final = Infinity;
  private readonly buffer = new Map<number, Data>();
  private readonly waitlist = new Map<number, PromiseWithResolvers<void>>();
  private readonly generator: AsyncGenerator<Chunk, false>;
  private pause?: PromiseWithResolvers<void>;

  constructor(source: ChunkSource, prefix: Name, opts: DataProducer.Options = {}) {
    super(source, prefix, opts);
    this.generator = this.listChunks();
    void this.produce(opts);
  }

  public override async getData(i: number) {
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

    await getOrInsert(this.waitlist, i, () => Promise.withResolvers()).promise;
    return this.buffer.get(i);
  }

  private async *listChunks(): AsyncGenerator<Chunk, false> {
    const iterator = getIterator(this.source.listChunks());
    try {
      while (true) {
        const { done, value } = await iterator.next();
        if (done) {
          return false;
        }
        yield value;
      }
    } finally {
      void iterator.return?.();
    }
  }

  private async produce({ bufferBehind = Infinity, bufferAhead = 16 }: DataProducer.Options) {
    let i = -1;
    while (true) {
      const { done, value: chunk } = await this.generator.next();
      if (done) {
        break;
      }
      ++i;
      assert(chunk.i === i, "unexpected chunk number");

      if (i > this.requested + bufferAhead) {
        this.pause = Promise.withResolvers<void>();
        await this.pause.promise;
        this.pause = undefined;
      }

      const data = await this.makeData(chunk);
      this.buffer.set(i, data);
      if (Number.isFinite(bufferBehind)) {
        this.buffer.delete(i - bufferAhead - bufferBehind);
      }

      const w = this.waitlist.get(i);
      if (w) {
        this.waitlist.delete(i);
        w.resolve();
      }
    }
    this.final = i;
  }

  public override close() {
    super.close();
    void this.generator.return(false);
    for (const w of this.waitlist.values()) {
      w.resolve();
    }
    this.pause?.resolve();
  }
}

/** Produce Data from a ChunkSource that supports on-demand generation. */
class OnDemandDataProducer extends DataProducer {
  constructor(source: ChunkSource, prefix: Name, opts: DataProducer.Options = {}) {
    super(source, prefix, opts);
    assert(typeof source.getChunk === "function");
  }

  public override async getData(i: number) {
    const chunk = await this.source.getChunk!(i);
    if (!chunk) {
      return undefined;
    }
    return this.makeData(chunk);
  }
}

export namespace DataProducer {
  export interface Options {
    /**
     * Choose a segment number naming convention.
     * @defaultValue `Segment3`
     */
    segmentNumConvention?: SegmentConvention;

    /**
     * Data ContentType.
     * @defaultValue 0
     */
    contentType?: number;

    /**
     * Data FreshnessPeriod (in milliseconds).
     * @defaultValue 60000
     */
    freshnessPeriod?: number;

    /**
     * Data signer.
     * @defaultValue digestSigning
     */
    signer?: Signer;

    /**
     * How many chunks behind latest request to store in buffer.
     * @defaultValue Infinity
     *
     * @remarks
     * This is ignored if the ChunkSource supports `getChunk()` function.
     *
     * After processing an Interest requesting segment `i`, subsequent Interests requesting
     * segment before `i - bufferBehind` cannot be answered.
     *
     * A larger number or even `Infinity` allows answering Interests requesting early segments,
     * at the cost of buffering many generated packets in memory.
     * A smaller number reduces memory usage, at the risk of not being able to answer some Interests,
     * which would become a problem in the presence of multiple consumers.
     */
    bufferBehind?: number;

    /**
     * How many chunks ahead of latest request to store in buffer.
     * @defaultValue 16
     *
     * @remarks
     * This is ignored if the ChunkSource supports `getChunk()` function.
     *
     * A larger number can reduce latency of fulfilling Interests if ChunkSource is slow.
     * A smaller number reduces memory usage.
     */
    bufferAhead?: number;
  }

  /** Create a DataProducer suitable for the ChunkSource. */
  export function create(source: ChunkSource, prefix: Name, opts: Options = {}): DataProducer {
    if (typeof source.getChunk === "function") {
      return new OnDemandDataProducer(source, prefix, opts);
    }
    return new SequentialDataProducer(source, prefix, opts);
  }

  /** Produce all Data packets from a ChunkSource. */
  export function listData(source: ChunkSource, prefix: Name, opts: Options = {}): AsyncIterable<Data> {
    return create(source, prefix, {
      ...opts,
      bufferBehind: 0,
      bufferAhead: 0,
    }).listData();
  }
}
