import { Forwarder, FwFace, InterestToken, RejectInterest } from "@ndn/fw";
import { Data, Interest } from "@ndn/l3pkt";
import { Name, NamingConvention } from "@ndn/name";
import { Segment as Segment03 } from "@ndn/naming-convention-03";
import { EventEmitter } from "events";
import pushable from "it-pushable";
import pDefer from "p-defer";
import { Readable } from "readable-stream";
import StrictEventEmitter from "strict-event-emitter-types";

interface Events {
  /** Emitted when a Data segment arrives. */
  segment: (segmentNum: number, data: Data) => void;
  /** Emitted when a data chunk arrives, in segment number order. */
  data: Uint8Array;
  /** Emitted after all data chunks arrive. */
  end: void;
  /** Emitted upon error. */
  error: Error;
}

type Emitter = StrictEventEmitter<EventEmitter, Events>;

class Fetcher extends (EventEmitter as new() => Emitter) implements FwFace.RxTxExtended {
  public get stream() {
    if (!this.stream_) {
      const s = this.stream_ = new Readable({ read: () => undefined });
      this.on("data", (payload) => s.push(payload));
      this.on("end", () => s.push(null));
      this.on("error", (err) => s.destroy(err));
    }
    return this.stream_;
  }

  public get promise() {
    if (!this.promise_) {
      this.promise_ = new Promise<Uint8Array>((resolve, reject) => {
        this.on("end", () => resolve(Buffer.concat(this.chunks)));
        this.on("error", reject);
      });
    }
    return this.promise_;
  }

  public readonly extendedTx = true;
  public get rx(): AsyncIterable<FwFace.Rxable> { return this.rx_; }

  /** Deliver packets to forwarding. */
  private rx_ = pushable<FwFace.Rxable>();
  private stream_?: Readable;
  private promise_?: Promise<Uint8Array>;
  private chunks: Uint8Array[] = [];
  private finalBlockId?: number;

  constructor(public readonly name: Name, opts: fetch.Options) {
    super();
    this.fw = opts.fw || Forwarder.getDefault();
    this.segmentNumConvention = opts.segmentNumConvention || Segment03;

    this.fw.addFace(this);
    setTimeout(() => {
      this.run()
      .catch((err: Error) => this.emit("error", err));
    }, 0);
  }

  /** Process packet from forwarding. */
  public async tx(iterable) {
    for await (const pkt of iterable) {
      switch (true) {
        case pkt instanceof Data: {
          const data = pkt as FwFace.DataResponse;
          for (const dataPromise of InterestToken.get(data) as Array<pDefer.DeferredPromise<Data>>) {
            dataPromise.resolve(data);
          }
          break;
        }
        case pkt instanceof RejectInterest: {
          const rej = pkt as RejectInterest;
          const dataPromise = InterestToken.get(rej) as pDefer.DeferredPromise<Data>;
          dataPromise.reject(new Error(rej.reason));
          break;
        }
      }
    }
  }

  public abort(err?: Error) {
    this.emit("error", err || new Error("abort"));
    this.rx_.end();
  }

  private async run() {
    for (let i = 0; typeof this.finalBlockId === "undefined" || i <= this.finalBlockId; ++i) {
      const dataPromise = pDefer<Data>();
      this.rx_.push(InterestToken.set(
        new Interest(this.name.append(this.segmentNumConvention, i)),
        dataPromise,
      ));
      let data;
      try {
        data = await dataPromise.promise;
      } catch (err) {
        this.abort(err);
        return;
      }
      this.emit("segment", i, data);

      if (data.finalBlockId && data.finalBlockId.equals(data.name.at(-1))) {
        this.finalBlockId = i;
      }
      this.chunks.push(data.content);

      if (data.content.length > 0) {
        this.emit("data", data.content);
      }
    }

    this.rx_.end();
    this.emit("end");
  }
}
interface Fetcher extends Required<fetch.Options> {}

/** Initiate fetching of a segment object. */
export function fetch(name: Name, opts: fetch.Options = {}): fetch.Fetcher {
  return new Fetcher(name, opts);
}

type Fetcher_ = Fetcher;

export namespace fetch {
  export interface Options {
    /** Use the specified forwarder instead of the default. */
    fw?: Forwarder;

    /**
     * Choose a segment number naming convention.
     * Default is Segment from @ndn/naming-convention-03 package.
     */
    segmentNumConvention?: NamingConvention<number, unknown>;
  }

  /** Fetching progress and response. */
  export interface Fetcher extends Pick<Fetcher_, keyof Emitter|"abort"> {
    /**
     * Wait for the segmented object to be completely fetched.
     * Resolves to reassembled object; rejects upon error.
     *
     * This property must be first accessed right after fetch() function call.
     */
    readonly promise: Promise<Uint8Array>;

    /**
     * Read from the segmented object as it's being fetched.
     *
     * This property must be first accessed right after fetch() function call.
     */
    readonly stream: Readable;
  }
}
