import { Endpoint } from "@ndn/endpoint";
import { CancelInterest, Forwarder, FwFace, InterestToken } from "@ndn/fw";
import { Data, Interest, Name } from "@ndn/packet";
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
      extendedTx: true,
      rx: this.tx(),
      tx: this.rx,
      toString() { return `fetch(${name})`; },
    } as FwFace.RxTxExtended);

    opts.abort?.signal.addEventListener("abort", () => {
      this.emit("error", new Error("abort"));
      this.close();
    });
  }

  public close() {
    this.logic.close();
    this.face.close();
  }

  private tx(): AsyncIterable<FwFace.Rxable> {
    const {
      segmentNumConvention = defaultSegmentConvention,
    } = this.opts;
    return this.logic.outgoing(
      ({ segNum, rto }) => {
        return InterestToken.set(
          new Interest(this.name.append(segmentNumConvention, segNum),
            Interest.Lifetime(rto + 200)),
          segNum);
      },
      ({ interest }) => {
        return new CancelInterest(interest);
      },
    );
  }

  private rx = async (iterable: AsyncIterable<FwFace.Txable>) => {
    for await (const pkt of iterable) {
      if (pkt instanceof Data) {
        this.handleData(pkt);
      }
    }
  };

  private handleData(data: Data) {
    const segNum = InterestToken.get<number>(data);
    if (typeof segNum === "undefined") {
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
