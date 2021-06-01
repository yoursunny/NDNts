import { Data, Interest, Nack, Name } from "@ndn/packet";
import { toHex } from "@ndn/tlv";
import { EventEmitter } from "events";
import MultiSet from "mnemonist/multi-set.js";
import pDefer from "p-defer";
import Fifo from "p-fifo";
import { buffer, filter, pipeline, tap } from "streaming-iterables";
import type TypedEmitter from "typed-emitter";

import type { Forwarder, ForwarderImpl } from "./forwarder";
import type { FwPacket } from "./packet";

interface Events {
  /** Emitted upon face closing. */
  close: () => void;
}

/** A socket or network interface associated with forwarding plane. */
export interface FwFace extends TypedEmitter<Events> {
  readonly fw: Forwarder;
  readonly attributes: FwFace.Attributes;
  readonly running: boolean;
  readonly txQueueLength: number;

  /** Shutdown the face. */
  close(): void;

  toString(): string;

  /** Determine if a route is present on the face. */
  hasRoute(name: Name): boolean;

  /** Add a route toward the face. */
  addRoute(name: Name, announcement?: FwFace.RouteAnnouncement): void;

  /** Remove a route toward the face. */
  removeRoute(name: Name, announcement?: FwFace.RouteAnnouncement): void;

  /** Add a prefix announcement associated with the face. */
  addAnnouncement(name: Name): void;

  /** Remove a prefix announcement associated with the face. */
  removeAnnouncement(name: Name): void;
}

export namespace FwFace {
  export interface Attributes extends Record<string, any> {
    /** Short string to identify the face. */
    describe?: string;
    /** Whether face is local. Default is false. */
    local?: boolean;
    /** Whether to readvertise registered routes. Default is true. */
    advertiseFrom?: boolean;
  }

  export type RouteAnnouncement = boolean | number | Name;

  interface RxTxBase {
    readonly attributes?: Attributes;
  }

  export interface RxTx extends RxTxBase {
    rx: AsyncIterable<FwPacket>;
    tx: (iterable: AsyncIterable<FwPacket>) => void;
  }

  export interface RxTxTransform extends RxTxBase {
    /**
     * The transform function takes an iterable of packets sent by the forwarder,
     * and returns an iterable of packets received by the forwarder.
     */
    transform: (iterable: AsyncIterable<FwPacket>) => AsyncIterable<FwPacket>;
  }
}

const STOP = Symbol("FaceImpl.Stop");

function computeAnnouncement(name: Name, announcement: FwFace.RouteAnnouncement): Name | undefined {
  switch (typeof announcement) {
    case "number":
      return name.getPrefix(announcement);
    case "boolean":
      return announcement ? name : undefined;
  }
  return announcement;
}

export class FaceImpl extends (EventEmitter as new() => TypedEmitter<Events>) implements FwFace {
  public readonly attributes: FwFace.Attributes;
  private readonly routes = new MultiSet<string>();
  private readonly announcements = new MultiSet<string>();
  private readonly stopping = pDefer<typeof STOP>();
  public running = true;
  private readonly txQueue = new Fifo<FwPacket>();
  public txQueueLength = 0;

  constructor(
      public readonly fw: ForwarderImpl,
      rxtx: FwFace.RxTx | FwFace.RxTxTransform,
      attributes: FwFace.Attributes,
  ) {
    super();
    this.attributes = {
      local: false,
      advertiseFrom: true,
      ...rxtx.attributes,
      ...attributes,
    };
    fw.emit("faceadd", this);
    fw.faces.add(this);

    void pipeline(
      () => this.txLoop(),
      buffer(this.fw.options.faceTxBuffer),
      tap((pkt) => fw.emit("pkttx", this, pkt)),
      (iterable: AsyncIterable<FwPacket>) => {
        const rxtxT = rxtx as FwFace.RxTxTransform;
        if (typeof rxtxT.transform === "function") {
          return rxtxT.transform(iterable);
        }
        const rxtxS = rxtx as FwFace.RxTx;
        rxtxS.tx(iterable);
        return rxtxS.rx;
      },
      tap((pkt) => fw.emit("pktrx", this, pkt)),
      buffer(this.fw.options.faceRxBuffer),
      this.rxLoop,
    );
  }

  public close(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.fw.faces.delete(this);
    for (const nameHex of this.routes.keys()) {
      this.fw.fib.delete(this, nameHex);
    }
    for (const nameHex of this.announcements.keys()) {
      this.fw.readvertise.removeAnnouncement(this, undefined, nameHex);
    }
    this.stopping.resolve(STOP);
    this.emit("close");
    this.fw.emit("facerm", this);
  }

  public toString() {
    return this.attributes.describe ?? "FwFace";
  }

  public hasRoute(name: Name): boolean {
    return this.routes.has(toHex(name.value));
  }

  public addRoute(name: Name, announcement: FwFace.RouteAnnouncement = true): void {
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

  public removeRoute(name: Name, announcement: FwFace.RouteAnnouncement = true): void {
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

  public addAnnouncement(name: Name): void {
    if (!this.attributes.advertiseFrom) {
      return;
    }
    const nameHex = toHex(name.value);
    this.announcements.add(nameHex);
    if (this.announcements.count(nameHex) === 1) {
      this.fw.readvertise.addAnnouncement(this, name, nameHex);
    }
  }

  public removeAnnouncement(name: Name): void {
    if (!this.attributes.advertiseFrom) {
      return;
    }
    const nameHex = toHex(name.value);
    this.announcements.remove(nameHex);
    if (this.announcements.count(nameHex) === 0) {
      this.fw.readvertise.removeAnnouncement(this, name, nameHex);
    }
  }

  /** Transmit a packet on the face. */
  public send(pkt: FwPacket): void {
    (async () => {
      ++this.txQueueLength;
      await this.txQueue.push(pkt);
      --this.txQueueLength;
    })();
  }

  private rxLoop = async (input: AsyncIterable<FwPacket>) => {
    for await (const pkt of filter(() => this.running, input)) {
      switch (true) {
        case pkt.l3 instanceof Interest: {
          this.fw[pkt.cancel ? "cancelInterest" : "processInterest"](this, pkt as FwPacket<Interest>);
          break;
        }
        case pkt.l3 instanceof Data: {
          this.fw.processData(this, pkt as FwPacket<Data>);
          break;
        }
        case pkt.l3 instanceof Nack: {
          this.fw.processNack(this, pkt as FwPacket<Nack>);
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
