import { Endpoint } from "@ndn/endpoint";
import { CancelInterest, Forwarder, FwFace, FwPacket } from "@ndn/fw";
import { Data, Interest, Name, Verifier } from "@ndn/packet";
import AbortController from "abort-controller";
import { EventEmitter } from "events";
import TypedEmitter from "typed-emitter";

import { defaultSegmentConvention, SegmentConvention } from "../convention";
import { FetchLogic } from "./logic";

interface Options extends FetchLogic.Options {
  /** Use the specified endpoint instead of the default. */
  endpoint?: Endpoint;

  /**
   * Choose a segment number naming convention.
   * Default is Segment from @ndn/naming-convention2 package.
   */
  segmentNumConvention?: SegmentConvention;

  /** Allow aborting fetching process. */
  abort?: AbortController;

  /** If specified, verify received Data. */
  verifier?: Verifier;
}

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

  constructor(private readonly name: Name, private readonly opts: Options) {
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

    opts.abort?.signal.addEventListener("abort", () => {
      this.emit("error", new Error("abort"));
      this.close();
    });
  }

  public close() {
    this.logic.close();
    this.face.close();
  }

  private tx(): AsyncIterable<FwPacket> {
    const {
      segmentNumConvention = defaultSegmentConvention,
    } = this.opts;
    return this.logic.outgoing(
      ({ segNum, rto }) => {
        const interest = new Interest(this.name.append(segmentNumConvention, segNum),
          Interest.Lifetime(rto + 200));
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
    try {
      await this.opts.verifier?.verify(data);
    } catch (err) {
      this.emit("error", new Error(`cannot verify segment ${segNum}: ${err}`));
      this.close();
      return;
    }
    this.logic.satisfy(segNum);
    if (data.isFinalBlock) {
      this.logic.setFinalSegNum(segNum);
    }
    this.emit("segment", segNum, data);
  }
}

type Options_ = Options;
export namespace Fetcher {
  export type Options = Options_;
}
