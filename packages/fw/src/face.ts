import { Data, Interest } from "@ndn/l3pkt";
import { Name } from "@ndn/name";
import { EventEmitter } from "events";
import pDefer from "p-defer";
import Fifo from "p-fifo";
import { buffer, filter, pipeline } from "streaming-iterables";
import StrictEventEmitter from "strict-event-emitter-types";

import { ForwarderImpl } from "./forwarder";
import { CancelInterest, DataResponse as DataResponse_, InterestRequest, InterestRequest as InterestRequest_,
         InterestToken, RejectInterest } from "./reqres";

interface Events {
  /** Emitted upon face closing. */
  close: void;
}

type Emitter = StrictEventEmitter<EventEmitter, Events>;

const STOP = Symbol("FaceImpl.Stop");

export class FaceImpl extends (EventEmitter as new() => Emitter) {
  public readonly stopping = pDefer<typeof STOP>();
  public running = true;
  public readonly routes = new Map<string, Name>();
  public readonly txQueue = new Fifo<Face.Txable>();
  public txQueueLength = 0;

  constructor(private readonly fw: ForwarderImpl,
              public readonly face: Face.Base) {
    super();
    fw.faces.add(this);
    pipeline(
      () => this.txLoop(),
      buffer(this.fw.options.faceTxBuffer),
      this.getTransform(),
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
    this.stopping.resolve(STOP);
    this.emit("close");
  }

  /** Add a route toward the face. */
  public addRoute(prefix: Name) {
    this.routes.set(prefix.toString(), prefix);
  }

  /** Remove a route toward the face. */
  public removeRoute(prefix: Name) {
    this.routes.delete(prefix.toString());
  }

  /**
   * Find a route toward the face that matches an Interest name.
   * @param name Interest name.
   * @returns number of name components in the route name, or -1 if no match.
   */
  public findRoute(name: Name): number {
    let longestNameLength = -1;
    for (const prefix of this.routes.values()) {
      if (prefix.isPrefixOf(name)) {
        longestNameLength = Math.max(longestNameLength, prefix.length);
      }
    }
    return longestNameLength;
  }

  /** Transmit a packet on the face. */
  public async send(pkt: Face.Txable) {
    ++this.txQueueLength;
    await this.txQueue.push(pkt);
    --this.txQueueLength;
  }

  /** Convert base RX/TX to an RxTxTransform function. */
  private getTransform(): Face.RxTxTransform {
    if (typeof this.face === "function") {
      return this.face;
    }

    const rtE = this.face as Face.RxTxExtended;
    if (rtE.extendedTx) {
      return (iterable) => {
        rtE.tx(iterable);
        return rtE.rx;
      };
    }

    const rtS = this.face as Face.RxTxBasic;
    return (iterable) => {
      rtS.tx(filter((pkt) => pkt instanceof Interest || pkt instanceof Data,
                    iterable) as AsyncIterable<Interest|Data>);
      return rtS.rx as AsyncIterable<Face.Rxable>;
    };
  }

  private rxLoop = async (input: AsyncIterable<Face.Rxable>) => {
    for await (const pkt of filter(() => this.running, input)) {
      switch (true) {
        case pkt instanceof Interest:
          const interest = pkt as InterestRequest;
          this.fw.processInterest(this, interest, InterestToken.get(interest));
          break;
        case pkt instanceof Data:
          const data = pkt as Data;
          this.fw.processData(this, data);
          break;
        case pkt instanceof CancelInterest:
          const canceled = pkt as CancelInterest;
          this.fw.cancelInterest(this, canceled.interest);
          break;
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
export interface Face extends Pick<FaceImpl, "close"|"addRoute"|"removeRoute"|keyof Emitter> {
  readonly running: boolean;
}

export namespace Face {
  /** Interest with optional application-defined token. */
  export type InterestRequest = InterestRequest_;
  /** Data with application-defined tokens from satisfied Interests. */
  export type DataResponse = DataResponse_;

  /** Item that can be received on face. */
  export type Rxable = Interest|InterestRequest|Data|CancelInterest;
  /** Item that can be transmitted on face, when extendedTx is enabled. */
  export type Txable = Interest|DataResponse|RejectInterest;

  /** Underlying face RX/TX that can only transmit encodable packets. */
  export interface RxTxBasic {
    /** Receive packets by forwarder. */
    rx: AsyncIterable<Rxable>;
    /** Transmit packets from forwarder. */
    tx(iterable: AsyncIterable<Interest|Data>): any;
  }

  /** Underlying face RX/TX that can transmit all Txable items. */
  export interface RxTxExtended {
    extendedTx: true;
    /** Receive packets by forwarder. */
    rx: AsyncIterable<Rxable>;
    /** Transmit packets from forwarder. */
    tx(iterable: AsyncIterable<Txable>): any;
  }

  /** Underlying face RX/TX implemented as a transform function. */
  export type RxTxTransform = (iterable: AsyncIterable<Txable>) => AsyncIterable<Rxable>;

  /** Underlying face RX/TX module. */
  export type RxTx = RxTxBasic|RxTxExtended|RxTxTransform;

  /** Underlying face. */
  export type Base = RxTx;
}
