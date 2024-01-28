import type { Endpoint } from "@ndn/endpoint";
import { CancelInterest, Forwarder, type FwFace, FwPacket } from "@ndn/fw";
import { Data, Interest, type Name, type Verifier } from "@ndn/packet";
import { CustomEvent } from "@ndn/util";
import { TypedEventTarget } from "typescript-event-target";

import { defaultSegmentConvention, type SegmentConvention } from "../convention";
import { FetchLogic } from "./logic";

type EventMap = {
  /** Emitted when a Data segment arrives. */
  segment: Fetcher.SegmentDataEvent;
  /** Emitted after all data chunks arrive. */
  end: Event;
  /** Emitted upon error. */
  error: CustomEvent<Error>;
};

/** Fetch Data packets as guided by FetchLogic. */
export class Fetcher extends TypedEventTarget<EventMap> {
  /** Number of segments retrieved so far. */
  public get count() { return this.count_; }
  private count_ = 0;
  private readonly logic: FetchLogic;
  private readonly face: FwFace;
  private readonly segmentNumConvention!: SegmentConvention;
  private readonly modifyInterest!: Interest.ModifyFunc;
  private readonly signal?: AbortSignal;
  private readonly lifetimeAfterRto!: number;
  private readonly acceptContentType!: readonly number[];
  private readonly verifier?: Verifier;

  constructor(private readonly name: Name, opts: Fetcher.Options) {
    super();

    const endpoint = opts.endpoint;
    const {
      fw = endpoint?.fw ?? Forwarder.getDefault(),
      describe = `fetch(${name})`,
      segmentNumConvention = defaultSegmentConvention,
      modifyInterest = endpoint?.opts.modifyInterest,
      signal = endpoint?.opts.signal,
      lifetimeAfterRto = 1000,
      acceptContentType = [0],
      verifier = endpoint?.opts.verifier,
    } = opts;
    Object.assign(this, {
      segmentNumConvention,
      modifyInterest: Interest.makeModifyFunc(modifyInterest),
      signal,
      lifetimeAfterRto,
      acceptContentType,
      verifier,
    } satisfies Fetcher.Options);

    this.logic = new FetchLogic(opts);
    this.logic.addEventListener("end", () => {
      this.dispatchTypedEvent("end", new Event("end"));
      this.close();
    });
    this.logic.addEventListener("exceedRetxLimit", ({ detail: segNum }) => {
      this.fail(new Error(`cannot retrieve segment ${segNum}`));
    });

    this.face = fw.addFace({
      rx: this.tx(),
      tx: this.rx,
    }, { describe });

    this.signal?.addEventListener("abort", this.handleAbort);
  }

  public close(): void {
    this.signal?.removeEventListener("abort", this.handleAbort);
    this.logic.close();
    this.face.close();
  }

  /**
   * Pause outgoing Interests, for backpressure from Data consumer.
   * Return a function for resuming.
   */
  public pause() {
    return this.logic.pause();
  }

  private tx(): AsyncIterable<FwPacket> {
    return this.logic.outgoing(
      ({ segNum, rto }) => {
        const interest = new Interest(this.name.append(this.segmentNumConvention, segNum),
          Interest.Lifetime(rto + this.lifetimeAfterRto));
        this.modifyInterest(interest);
        return FwPacket.create(interest, segNum);
      },
      ({ interest: { l3, token } }) => new CancelInterest(l3, token),
    );
  }

  private readonly rx = async (iterable: AsyncIterable<FwPacket>) => {
    for await (const { l3, token, congestionMark = 0 } of iterable) {
      if (l3 instanceof Data && typeof token === "number" && this.acceptContentType.includes(l3.contentType)) {
        await this.handleData(l3, token, congestionMark);
      }
    }
    const ok = this.logic.end();
    if (!ok) {
      this.fail(new Error("fetch incomplete"));
    }
  };

  private async handleData(data: Data, segNum: number, congestionMark: number) {
    const now = this.logic.now();
    try {
      await this.verifier?.verify(data);
    } catch (err: unknown) {
      this.fail(new Error(`cannot verify segment ${segNum}: ${err}`));
      return;
    }

    this.logic.satisfy(segNum, now, congestionMark !== 0);
    if (data.isFinalBlock) {
      this.logic.setFinalSegNum(segNum);
    } else if (data.finalBlockId?.is(this.segmentNumConvention)) {
      this.logic.setFinalSegNum(data.finalBlockId.as(this.segmentNumConvention), true);
    }
    ++this.count_;
    this.dispatchTypedEvent("segment", new Fetcher.SegmentDataEvent("segment", segNum, data));
  }

  private fail(err: Error): void {
    setTimeout(() => {
      this.dispatchTypedEvent("error", new CustomEvent("error", { detail: err }));
      this.close();
    }, 0);
  }

  private readonly handleAbort = () => {
    this.fail(new Error("fetch aborted"));
  };
}

export namespace Fetcher {
  export interface Options extends FetchLogic.Options {
    /**
     * Inherit fetcher options from Endpoint consumer options.
     *
     * These options are inherited if the corresponding fetcher option is unset:
     * @li fw
     * @li modifyInterest
     * @li signal
     * @li verifier
     *
     * Other options cannot be inherited, notably:
     * @li describe
     * @li retx
     */
    endpoint?: Endpoint;

    /** Use the specified logical forwarder instead of the default. */
    fw?: Forwarder;

    /** FwFace description. */
    describe?: string;

    /**
     * Choose a segment number naming convention.
     * Default is Segment from @ndn/naming-convention2 package.
     */
    segmentNumConvention?: SegmentConvention;

    /**
     * Modify Interest according to specified options.
     * This can also be used to witness Interests without modification.
     */
    modifyInterest?: Interest.Modify;

    /** AbortSignal that allows canceling the Interest via AbortController. */
    signal?: AbortSignal;

    /**
     * InterestLifetime added to RTO.
     * Default is 1000ms.
     * Ignored if `lifetime` is set.
     */
    lifetimeAfterRto?: number;

    /**
     * List of acceptable ContentType values.
     * Default is [0].
     */
    acceptContentType?: readonly number[];

    /** If specified, verify received Data. */
    verifier?: Verifier;
  }

  export interface SegmentData {
    segNum: number;
    data: Data;
  }

  export class SegmentDataEvent extends Event implements SegmentData {
    constructor(type: string, public readonly segNum: number, public readonly data: Data) {
      super(type);
    }
  }
}
