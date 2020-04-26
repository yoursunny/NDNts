import { Data, Interest, Nack, Name } from "@ndn/packet";
import { toHex } from "@ndn/tlv";
import EventEmitter from "events";
import MultiSet from "mnemonist/multi-set";
import pDefer from "p-defer";
import Fifo from "p-fifo";
import { buffer, filter, pipeline, tap } from "streaming-iterables";
import StrictEventEmitter from "strict-event-emitter-types";

import { Advertise } from "./advertise";
import { ForwarderImpl } from "./forwarder";
import { CancelInterest, isL3Pkt, L3Pkt, RejectInterest } from "./reqres";

interface Events {
  /** Emitted upon face closing. */
  close: void;
}

type Emitter = StrictEventEmitter<EventEmitter, Events>;

type TransformFunc = (iterable: AsyncIterable<Face.Txable>) => AsyncIterable<Face.Rxable>;

const STOP = Symbol("FaceImpl.Stop");

function computeAnnouncement(name: Name, announcement: Face.RouteAnnouncement): Name|undefined {
  switch (typeof announcement) {
    case "number":
      return name.getPrefix(announcement);
    case "boolean":
      return announcement ? name : undefined;
  }
  return announcement;
}

export class FaceImpl extends (EventEmitter as new() => Emitter) {
  public readonly attributes: Face.Attributes;
  public advertise?: Advertise;
  private readonly routes = new MultiSet<string>();
  private readonly announcements = new MultiSet<string>();
  private readonly stopping = pDefer<typeof STOP>();
  public running = true;
  private readonly txQueue = new Fifo<Face.Txable>();
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
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
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
    for (const nameHex of this.routes.keys()) {
      this.fw.fib.delete(this, nameHex);
    }
    for (const nameHex of this.announcements.keys()) {
      this.fw.removeAnnouncement(this, undefined, nameHex);
    }
    this.stopping.resolve(STOP);
    this.emit("close");
    this.fw.emit("facerm", this);
  }

  public toString() {
    return this.inner.toString();
  }

  /** Add a route toward the face. */
  public addRoute(name: Name, announcement: Face.RouteAnnouncement = true) {
    this.fw.emit("prefixadd", this, name);
    const nameHex = toHex(name.value);
    this.routes.add(nameHex);
    if (this.routes.count(nameHex) === 1) {
      this.fw.fib.insert(this, nameHex);
    }

    const ann = computeAnnouncement(name, announcement);
    if (ann) {
      this.addAnnouncement(ann);
    }
  }

  /** Remove a route toward the face. */
  public removeRoute(name: Name, announcement: Face.RouteAnnouncement = true) {
    const ann = computeAnnouncement(name, announcement);
    if (ann) {
      this.removeAnnouncement(ann);
    }

    const nameHex = toHex(name.value);
    this.routes.remove(nameHex);
    if (this.routes.count(nameHex) === 0) {
      this.fw.fib.delete(this, nameHex);
    }
    this.fw.emit("prefixrm", this, name);
  }

  /** Add a prefix announcement associated with the face. */
  public addAnnouncement(name: Name) {
    if (!this.attributes.advertiseFrom) {
      return;
    }
    const nameHex = toHex(name.value);
    this.announcements.add(nameHex);
    if (this.announcements.count(nameHex) === 1) {
      this.fw.addAnnouncement(this, name, nameHex);
    }
  }

  /** Remove a prefix announcement associated with the face. */
  public removeAnnouncement(name: Name) {
    if (!this.attributes.advertiseFrom) {
      return;
    }
    const nameHex = toHex(name.value);
    this.announcements.remove(nameHex);
    if (this.announcements.count(nameHex) === 0) {
      this.fw.removeAnnouncement(this, name, nameHex);
    }
  }

  /** Transmit a packet on the face. */
  public send(pkt: Face.Txable): void {
    (async () => {
      ++this.txQueueLength;
      await this.txQueue.push(pkt);
      --this.txQueueLength;
    })();
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
      rtS.tx(filter(isL3Pkt, iterable));
      return rtS.rx;
    };
  }

  private rxLoop = async (input: AsyncIterable<Face.Rxable>) => {
    for await (const pkt of filter(() => this.running, input)) {
      switch (true) {
        case pkt instanceof Interest: {
          const interest = pkt as Interest;
          this.fw.processInterest(this, interest);
          break;
        }
        case pkt instanceof Data: {
          const data = pkt as Data;
          this.fw.processData(this, data);
          break;
        }
        case pkt instanceof Nack: {
          const nack = pkt as Nack;
          this.fw.processNack(this, nack);
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
  };

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

  export const DefaultOptions: Options = {
    faceRxBuffer: 16,
    faceTxBuffer: 16,
  };
}

/** A socket or network interface associated with forwarding plane. */
export interface Face extends Pick<FaceImpl,
"fw"|"advertise"|"attributes"|"close"|"toString"|"addRoute"|"removeRoute"|
Exclude<keyof Emitter, "emit">> {
  readonly running: boolean;
  readonly txQueueLength: number;
}

export namespace Face {
  export interface Attributes extends Record<string, any> {
    /** Whether face is local. Default is false. */
    local?: boolean;
    /** Whether to readvertise registered routes. Default is true. */
    advertiseFrom?: boolean;
  }

  export type RouteAnnouncement = boolean | number | Name;

  /** Item that can be received on face. */
  export type Rxable = L3Pkt|CancelInterest;
  /** Item that can be transmitted on face, when extendedTx is enabled. */
  export type Txable = L3Pkt|RejectInterest;

  /** Underlying face RX/TX that can only transmit encodable packets. */
  export interface RxTxBasic {
    /** Receive packets by forwarder. */
    rx: AsyncIterable<Rxable>;
    /** Transmit packets from forwarder. */
    tx: (iterable: AsyncIterable<L3Pkt>) => void;
  }

  /** Underlying face RX/TX that can transmit all Txable items. */
  export interface RxTxExtended {
    extendedTx: true;
    /** Receive packets by forwarder. */
    rx: AsyncIterable<Rxable>;
    /** Transmit packets from forwarder. */
    tx: (iterable: AsyncIterable<Txable>) => void;
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
