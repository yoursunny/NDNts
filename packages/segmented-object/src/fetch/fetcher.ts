import { EventEmitter } from "node:events";

import type { Endpoint } from "@ndn/endpoint";
import { type FwFace, CancelInterest, Forwarder, FwPacket } from "@ndn/fw";
import { type Name, type Verifier, Data, Interest } from "@ndn/packet";
import type TypedEmitter from "typed-emitter";

import { type SegmentConvention, defaultSegmentConvention } from "../convention";
import { FetchLogic } from "./logic";

type Events = {
  /** Emitted when a Data segment arrives. */
  segment: (seg: Fetcher.SegmentData) => void;
  /** Emitted after all data chunks arrive. */
  end: () => void;
  /** Emitted upon error. */
  error: (err: Error) => void;
};

/** Fetch Data packets as guided by FetchLogic. */
export class Fetcher extends (EventEmitter as new() => TypedEmitter<Events>) {
  /** Number of segments retrieved so far. */
  public get count() { return this.count_; }
  private count_ = 0;
  private readonly logic: FetchLogic;
  private readonly face: FwFace;

  constructor(private readonly name: Name, private readonly opts: Fetcher.Options) {
    super();
    this.logic = new FetchLogic(opts);
    this.logic.on("end", () => { this.emit("end"); this.close(); });
    this.logic.on("exceedRetxLimit", (segNum) => {
      this.fail(new Error(`cannot retrieve segment ${segNum}`));
    });

    this.face = (opts.endpoint?.fw ?? Forwarder.getDefault()).addFace({
      rx: this.tx(),
      tx: this.rx,
    }, {
      describe: opts.describe ?? `fetch(${name})`,
    });

    opts.signal?.addEventListener("abort", this.handleAbort);
  }

  public close() {
    this.on("error", () => undefined); // ignore further errors
    this.opts.signal?.removeEventListener("abort", this.handleAbort);
    this.logic.close();
    this.face.close();
  }

  public pause() {
    return this.logic.pause();
  }

  private tx(): AsyncIterable<FwPacket> {
    const {
      segmentNumConvention = defaultSegmentConvention,
      modifyInterest,
      lifetimeAfterRto = 1000,
    } = this.opts;
    const modify = Interest.makeModifyFunc(modifyInterest);
    return this.logic.outgoing(
      ({ segNum, rto }) => {
        const interest = new Interest(this.name.append(segmentNumConvention, segNum),
          Interest.Lifetime(rto + lifetimeAfterRto));
        modify(interest);
        return FwPacket.create(interest, segNum);
      },
      ({ interest: { l3, token } }) => new CancelInterest(l3, token),
    );
  }

  private readonly rx = async (iterable: AsyncIterable<FwPacket>) => {
    const {
      acceptContentType = [0],
    } = this.opts;
    for await (const { l3, token } of iterable) {
      if (l3 instanceof Data && typeof token === "number" && acceptContentType.includes(l3.contentType)) {
        void this.handleData(l3, token);
      }
    }
  };

  private async handleData(data: Data, segNum: number) {
    const now = this.logic.now();
    try {
      await this.opts.verifier?.verify(data);
    } catch (err: unknown) {
      this.fail(new Error(`cannot verify segment ${segNum}: ${err}`));
      return;
    }

    this.logic.satisfy(segNum, now);
    if (data.isFinalBlock) {
      this.logic.setFinalSegNum(segNum);
    } else {
      let segmentConvention: SegmentConvention;
      if (data.finalBlockId?.is((segmentConvention = this.opts.segmentNumConvention ?? defaultSegmentConvention))) {
        this.logic.setFinalSegNum(data.finalBlockId.as(segmentConvention), true);
      }
    }
    ++this.count_;
    this.emit("segment", { segNum, data });
  }

  private fail(err: Error): void {
    setTimeout(() => {
      this.emit("error", err);
      this.close();
    }, 0);
  }

  private readonly handleAbort = () => {
    this.fail(new Error("abort"));
  };
}

export namespace Fetcher {
  export interface Options extends FetchLogic.Options {
    /** Use the specified endpoint instead of the default. */
    endpoint?: Endpoint;

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
}
