import { Data, Interest, Name } from "@ndn/packet";
import EventEmitter from "events";
import pDefer from "p-defer";
import Fifo from "p-fifo";
import { buffer, filter, pipeline, tap } from "streaming-iterables";
import StrictEventEmitter from "strict-event-emitter-types";

import { Advertise } from "./advertise";
import { ForwarderImpl } from "./forwarder";
import { CancelInterest, DataResponse, InterestRequest, InterestToken, RejectInterest } from "./reqres";

interface Events {
  /** Emitted upon face closing. */
  close: void;
}

type Emitter = StrictEventEmitter<EventEmitter, Events>;

type TransformFunc = (iterable: AsyncIterable<Face.Txable>) => AsyncIterable<Face.Rxable>;

const STOP = Symbol("FaceImpl.Stop");

export class FaceImpl extends (EventEmitter as new() => Emitter) {
  public readonly attributes: Face.Attributes;
  public advertise?: Advertise;
  public readonly stopping = pDefer<typeof STOP>();
  public running = true;
  public readonly routes = new Set<string>(); // used by FIB
  public readonly txQueue = new Fifo<Face.Txable>();
  public txQueueLength = 0;

  constructor(public readonly fw: ForwarderImpl,
              public readonly inner: Face.Base,
              attributes: Face.Attributes) {
    super();
    this.attributes = {
      local: false,
      advertiseFrom: true,
      ...inner.attributes,
      ...attributes,
    };
    fw.emit("faceadd", this);
    fw.faces.add(this);
    pipeline(
      () => this.txLoop(),
      buffer(this.fw.options.faceTxBuffer),
      tap((pkt) => fw.emit("pkttx", this, pkt)),
      this.getTransform(),
      tap((pkt) => fw.emit("pktrx", this, pkt)),
      buffer(this.fw.options.faceRxBuffer),
      this.rxLoop,
    );
  }

  /** Shutdown the face. */
  public close() {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.fw.faces.delete(this);
    this.fw.fib.closeFace(this);
    this.stopping.resolve(STOP);
    this.emit("close");
    this.fw.emit("facerm", this);
  }

  public toString() {
    return this.inner.toString();
  }

  /** Add a route toward the face. */
  public addRoute(name: Name) {
    this.fw.emit("prefixadd", this, name);
    this.fw.fib.insert(name, this);
  }

  /** Remove a route toward the face. */
  public removeRoute(name: Name) {
    this.fw.fib.delete(name, this);
    this.fw.emit("prefixrm", this, name);
  }

  /** Transmit a packet on the face. */
  public async send(pkt: Face.Txable) {
    ++this.txQueueLength;
    await this.txQueue.push(pkt);
    --this.txQueueLength;
  }

  /** Convert base RX/TX to a TransformFunc. */
  private getTransform(): TransformFunc {
    const rtT = this.inner as Face.RxTxTransform;
    if (rtT.transform) {
      return rtT.transform;
    }

    const rtE = this.inner as Face.RxTxExtended;
    if (rtE.extendedTx) {
      return (iterable) => {
        rtE.tx(iterable);
        return rtE.rx;
      };
    }

    const rtS = this.inner as Face.RxTxBasic;
    return (iterable) => {
      rtS.tx(filter(
        (pkt): pkt is (Interest|DataResponse) => pkt instanceof Interest || pkt instanceof Data,
        iterable));
      return rtS.rx;
    };
  }

  private rxLoop = async (input: AsyncIterable<Face.Rxable>) => {
    for await (const pkt of filter(() => this.running, input)) {
      switch (true) {
        case pkt instanceof Interest: {
          const interest = pkt as InterestRequest;
          this.fw.processInterest(this, interest, InterestToken.get(interest));
          break;
        }
        case pkt instanceof Data: {
          const data = pkt as Data;
          this.fw.processData(this, data);
          break;
        }
        case pkt instanceof CancelInterest: {
          const canceled = pkt as CancelInterest;
          this.fw.cancelInterest(this, canceled.interest);
          break;
        }
      }
    }
    this.close();
  }

  private async *txLoop() {
    while (true) {
      const pkt = await Promise.race([
        this.stopping.promise,
        this.txQueue.shift(),
      ]);
      if (pkt === STOP) {
        break;
      }
      yield pkt;
    }
    this.close();
  }
}

export namespace FaceImpl {
  export interface Options {
    faceRxBuffer: number;
    faceTxBuffer: number;
  }

  export const DefaultOptions = {
    faceRxBuffer: 16,
    faceTxBuffer: 16,
  } as Options;
}

/** A socket or network interface associated with forwarding plane. */
export interface Face extends Pick<FaceImpl,
    "fw"|"advertise"|"attributes"|"close"|"toString"|"addRoute"|"removeRoute"|
    Exclude<keyof Emitter, "emit">> {
  readonly running: boolean;
}

export namespace Face {
  export interface Attributes extends Record<string, any> {
    /** Whether face is local. Default is false. */
    local?: boolean;
    /** Whether to readvertise registered routes. Default is true. */
    advertiseFrom?: boolean;
  }

  /** Item that can be received on face. */
  export type Rxable = Interest|InterestRequest|Data|CancelInterest;
  /** Item that can be transmitted on face, when extendedTx is enabled. */
  export type Txable = Interest|DataResponse|RejectInterest;

  /** Underlying face RX/TX that can only transmit encodable packets. */
  export interface RxTxBasic {
    /** Receive packets by forwarder. */
    rx: AsyncIterable<Rxable>;
    /** Transmit packets from forwarder. */
    tx(iterable: AsyncIterable<Interest|Data>): void;
  }

  /** Underlying face RX/TX that can transmit all Txable items. */
  export interface RxTxExtended {
    extendedTx: true;
    /** Receive packets by forwarder. */
    rx: AsyncIterable<Rxable>;
    /** Transmit packets from forwarder. */
    tx(iterable: AsyncIterable<Txable>): void;
  }

  /** Underlying face RX/TX implemented as a transform function. */
  export interface RxTxTransform {
    transform: TransformFunc;
  }

  /** Underlying face RX/TX module. */
  export type RxTx = RxTxBasic|RxTxExtended|RxTxTransform;

  /** Underlying face. */
  export type Base = RxTx & {
    readonly attributes?: Attributes;

    /** Return short string to identify this face. */
    toString?: () => string;
  };
}
