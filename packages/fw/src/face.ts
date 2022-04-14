import { type NameLike, Data, Interest, Nack, Name, NameMultiSet } from "@ndn/packet";
import { safeIter } from "@ndn/util";
import pushable from "it-pushable";
import { EventEmitter } from "node:events";
import { filter, pipeline, tap } from "streaming-iterables";
import type TypedEmitter from "typed-emitter";

import type { Forwarder, ForwarderImpl } from "./forwarder";
import type { FwPacket } from "./packet";

type Events = {
  /** Emitted upon face is up as reported by lower layer. */
  up: () => void;
  /** Emitted upon face is down as reported by lower layer. */
  down: () => void;
  /** Emitted upon face is closed. */
  close: () => void;
};

/** A socket or network interface associated with forwarding plane. */
export interface FwFace extends TypedEmitter<Events> {
  readonly fw: Forwarder;
  readonly attributes: FwFace.Attributes;
  readonly running: boolean;

  /** Shutdown the face. */
  close(): void;

  toString(): string;

  /** Determine if a route is present on the face. */
  hasRoute(name: NameLike): boolean;

  /** Add a route toward the face. */
  addRoute(name: NameLike, announcement?: FwFace.RouteAnnouncement): void;

  /** Remove a route toward the face. */
  removeRoute(name: NameLike, announcement?: FwFace.RouteAnnouncement): void;

  /** Add a prefix announcement associated with the face. */
  addAnnouncement(name: NameLike): void;

  /** Remove a prefix announcement associated with the face. */
  removeAnnouncement(name: NameLike): void;
}

export namespace FwFace {
  export interface Attributes extends Record<string, any> {
    /** Short string to identify the face. */
    describe?: string;
    /** Whether face is local. Default is false. */
    local?: boolean;
    /** Whether to readvertise registered routes. Default is true. */
    advertiseFrom?: boolean;
    /**
     * Whether routes registered on this face would cause FIB to stop matching onto shorter prefixes.
     * Default is true.
     * More explanation in @ndn/endpoint package ProducerOptions type.
     */
    routeCapture?: boolean;
  }

  export type RouteAnnouncement = boolean | number | NameLike;

  export type RxTxEvents = {
    up: () => void;
    down: () => void;
  };

  export interface RxTxBase {
    readonly attributes?: Attributes;

    on?: (...args: Parameters<TypedEmitter<RxTxEvents>["on"]>) => void;
    off?: (...args: Parameters<TypedEmitter<RxTxEvents>["off"]>) => void;
  }

  export interface RxTx extends RxTxBase {
    rx: AsyncIterable<FwPacket>;
    tx: (iterable: AsyncIterable<FwPacket>) => void;
  }

  export interface RxTxDuplex extends RxTxBase {
    /**
     * The transform function takes an iterable of packets sent by the forwarder,
     * and returns an iterable of packets received by the forwarder.
     */
    duplex: (iterable: AsyncIterable<FwPacket>) => AsyncIterable<FwPacket>;
  }
}

function duplexFromRxTx(rxtx: FwFace.RxTx | FwFace.RxTxDuplex): FwFace.RxTxDuplex["duplex"] {
  return (iterable: AsyncIterable<FwPacket>) => {
    const rxtxD = rxtx as FwFace.RxTxDuplex;
    if (typeof rxtxD.duplex === "function") {
      return rxtxD.duplex(iterable);
    }
    const rxtxS = rxtx as FwFace.RxTx;
    rxtxS.tx(iterable);
    return rxtxS.rx;
  };
}

function computeAnnouncement(name: Name, announcement: FwFace.RouteAnnouncement): Name | undefined {
  switch (typeof announcement) {
    case "number":
      return name.getPrefix(announcement);
    case "boolean":
      return announcement ? name : undefined;
  }
  return Name.from(announcement);
}

export class FaceImpl extends (EventEmitter as new() => TypedEmitter<Events>) implements FwFace {
  public readonly attributes: FwFace.Attributes;
  private readonly routes = new NameMultiSet();
  private readonly announcements = new NameMultiSet();
  public running = true;
  private readonly txQueue = pushable<FwPacket>();

  constructor(
      public readonly fw: ForwarderImpl,
      private readonly rxtx: FwFace.RxTx | FwFace.RxTxDuplex,
      attributes: FwFace.Attributes,
  ) {
    super();
    this.attributes = {
      local: false,
      advertiseFrom: true,
      routeCapture: true,
      ...rxtx.attributes,
      ...attributes,
    };
    fw.emit("faceadd", this);
    fw.faces.add(this);

    void pipeline(
      () => this.txLoop(),
      tap((pkt) => fw.emit("pkttx", this, pkt)),
      duplexFromRxTx(rxtx),
      tap((pkt) => fw.emit("pktrx", this, pkt)),
      this.rxLoop,
    );

    rxtx.on?.("up", this.handleLowerUp);
    rxtx.on?.("down", this.handleLowerDown);
  }

  public close(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.rxtx.off?.("up", this.handleLowerUp);
    this.rxtx.off?.("down", this.handleLowerDown);

    this.fw.faces.delete(this);
    for (const [name] of this.routes.multiplicities()) {
      this.fw.fib.delete(this, name.valueHex);
    }
    for (const [name] of this.announcements.multiplicities()) {
      this.fw.readvertise.removeAnnouncement(this, name);
    }

    this.txQueue.end(new Error("close"));
    this.emit("close");
    this.fw.emit("facerm", this);
  }

  public override toString() {
    return this.attributes.describe ?? "FwFace";
  }

  public hasRoute(nameInput: NameLike): boolean {
    const name = Name.from(nameInput);
    return this.routes.count(name) > 0;
  }

  public addRoute(nameInput: NameLike, announcement: FwFace.RouteAnnouncement = true): void {
    const name = Name.from(nameInput);

    this.fw.emit("prefixadd", this, name);
    if (this.routes.add(name) === 1) {
      this.fw.fib.insert(this, name.valueHex, this.attributes.routeCapture!);
    }

    const ann = computeAnnouncement(name, announcement);
    if (ann) {
      this.addAnnouncement(ann);
    }
  }

  public removeRoute(nameInput: NameLike, announcement: FwFace.RouteAnnouncement = true): void {
    const name = Name.from(nameInput);

    const ann = computeAnnouncement(name, announcement);
    if (ann) {
      this.removeAnnouncement(ann);
    }

    if (this.routes.remove(name) === 0) {
      this.fw.fib.delete(this, name.valueHex);
    }
    this.fw.emit("prefixrm", this, name);
  }

  public addAnnouncement(nameInput: NameLike): void {
    if (!this.attributes.advertiseFrom) {
      return;
    }
    const name = Name.from(nameInput);
    if (this.announcements.add(name) === 1) {
      this.fw.readvertise.addAnnouncement(this, name);
    }
  }

  public removeAnnouncement(nameInput: NameLike): void {
    if (!this.attributes.advertiseFrom) {
      return;
    }
    const name = Name.from(nameInput);
    if (this.announcements.remove(name) === 0) {
      this.fw.readvertise.removeAnnouncement(this, name);
    }
  }

  /** Transmit a packet on the face. */
  public send(pkt: FwPacket): void {
    if (!this.running) {
      return;
    }
    this.txQueue.push(pkt);
  }

  private readonly handleLowerUp = () => {
    this.emit("up");
  };

  private readonly handleLowerDown = () => {
    this.emit("down");
  };

  private readonly rxLoop = async (input: AsyncIterable<FwPacket>) => {
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

  private txLoop(): AsyncIterable<FwPacket> {
    return safeIter(this.txQueue);
  }
}
