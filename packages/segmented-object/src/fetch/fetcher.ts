import { Endpoint } from "@ndn/endpoint";
import { CancelInterest, Forwarder, FwFace, FwPacket } from "@ndn/fw";
import { Data, Interest, Name, Verifier } from "@ndn/packet";
import type { AbortSignal } from "abort-controller";
import { EventEmitter } from "events";
import type TypedEmitter from "typed-emitter";

import { defaultSegmentConvention, SegmentConvention } from "../convention";
import { FetchLogic } from "./logic";

interface Events {
  /** Emitted when a Data segment arrives. */
  segment: (segNum: number, data: Data) => void;
  /** Emitted after all data chunks arrive. */
  end: () => void;
  /** Emitted upon error. */
  error: (err: Error) => void;
}

export class Fetcher extends (EventEmitter as new() => TypedEmitter<Events>) {
  private readonly logic: FetchLogic;
  private readonly face: FwFace;

  constructor(private readonly name: Name, private readonly opts: Fetcher.Options) {
    super();
    this.logic = new FetchLogic(opts);
    this.logic.on("end", () => { this.emit("end"); this.close(); });
    this.logic.on("exceedRetxLimit", (segNum) => {
      this.emit("error", new Error(`cannot retrieve segment ${segNum}`));
      this.close();
    });

    this.face = (opts.endpoint?.fw ?? Forwarder.getDefault()).addFace({
      rx: this.tx(),
      tx: this.rx,
    }, {
      describe: `fetch(${name})`,
    });

    opts.signal?.addEventListener("abort", this.handleAbort);
  }

  public close() {
    this.opts.signal?.removeEventListener("abort", this.handleAbort);
    this.logic.close();
    this.face.close();
  }

  private tx(): AsyncIterable<FwPacket> {
    const {
      segmentNumConvention = defaultSegmentConvention,
      lifetimeAfterRto = 1000,
    } = this.opts;
    return this.logic.outgoing(
      ({ segNum, rto }) => {
        const interest = new Interest(this.name.append(segmentNumConvention, segNum),
          Interest.Lifetime(rto + lifetimeAfterRto));
        return FwPacket.create(interest, segNum);
      },
      ({ interest: { l3, token } }) => {
        return new CancelInterest(l3, token);
      },
    );
  }

  private rx = async (iterable: AsyncIterable<FwPacket>) => {
    for await (const { l3, token } of iterable) {
      if (l3 instanceof Data && typeof token === "number") {
        void this.handleData(l3, token);
      }
    }
  };

  private async handleData(data: Data, segNum: number) {
    const now = this.logic.now();
    try {
      await this.opts.verifier?.verify(data);
    } catch (err: unknown) {
      this.emit("error", new Error(`cannot verify segment ${segNum}: ${err}`));
      this.close();
      return;
    }

    this.logic.satisfy(segNum, now);
    if (data.isFinalBlock) {
      this.logic.setFinalSegNum(segNum);
    } else {
      const {
        segmentNumConvention = defaultSegmentConvention,
      } = this.opts;
      if (data.finalBlockId?.is(segmentNumConvention)) {
        this.logic.setFinalSegNum(data.finalBlockId.as(segmentNumConvention), true);
      }
    }
    this.emit("segment", segNum, data);
  }

  private handleAbort = () => {
    this.emit("error", new Error("abort"));
    this.close();
  };
}

export namespace Fetcher {
  export interface Options extends FetchLogic.Options {
    /** Use the specified endpoint instead of the default. */
    endpoint?: Endpoint;

    /**
     * Choose a segment number naming convention.
     * Default is Segment from @ndn/naming-convention2 package.
     */
    segmentNumConvention?: SegmentConvention;

    /** AbortSignal that allows canceling the Interest via AbortController. */
    signal?: AbortSignal;

    /**
     * InterestLifetime added to RTO.
     * Default is 1000ms.
     */
    lifetimeAfterRto?: number;

    /** If specified, verify received Data. */
    verifier?: Verifier;
  }
}
