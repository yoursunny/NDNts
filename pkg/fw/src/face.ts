import { Data, Interest, Nack, Name, type NameLike, NameMultiSet } from "@ndn/packet";
import { pushable, safeIter } from "@ndn/util";
import { filter, pipeline, tap } from "streaming-iterables";
import { TypedEventTarget } from "typescript-event-target";

import { Forwarder, type ForwarderImpl } from "./forwarder";
import type { FwPacket } from "./packet";

type EventMap = {
  /** Emitted upon face is up as reported by lower layer. */
  up: Event;
  /** Emitted upon face is down as reported by lower layer. */
  down: Event;
  /** Emitted upon face is closed. */
  close: Event;
};

/** A socket or network interface associated with logical forwarder. */
export interface FwFace extends TypedEventTarget<EventMap> {
  readonly fw: Forwarder;
  readonly attributes: FwFace.Attributes;
  readonly running: boolean;

  /** Shutdown the face. */
  close(): void;

  toString(): string;

  /** Determine if a route is present on the face. */
  hasRoute(name: NameLike): boolean;

  /**
   * Add a route toward the face.
   * @param name - Route name.
   * @param announcement - Prefix announcement name or how to derive it from `name`.
   *
   * @remarks
   * When the logical forwarder receives an Interest matching `name`, it may forward the Interest
   * to this face. Unless `announcement` is set to `false`, this also invokes
   * {@link addAnnouncement} to readvertise the name prefix to remote forwarders.
   */
  addRoute(name: NameLike, announcement?: FwFace.RouteAnnouncement): void;

  /** Remove a route toward the face. */
  removeRoute(name: NameLike, announcement?: FwFace.RouteAnnouncement): void;

  /**
   * Add a prefix announcement associated with the face.
   * @param name - Prefix announcement name.
   *
   * @remarks
   * The announcement is passed to {@link ReadvertiseDestination}s (e.g. NFD prefix registration
   * client) on the logical forwarder, so that remote forwarders would send Interests matching
   * the prefix to the local logical forwarder.
   *
   * Multiple FwFaces could make the same announcement. When the last FwFace making an announcement
   * is closed, the announcement is withdrawn from {@link ReadvertiseDestination}s.
   *
   * This function has no effect if `FwFace.Attributes.advertiseFrom` is set to `false`.
   */
  addAnnouncement(name: NameLike): void;

  /** Remove a prefix announcement associated with the face. */
  removeAnnouncement(name: NameLike): void;
}

export namespace FwFace {
  /** Attributes of a logical forwarder face. */
  export interface Attributes extends Record<string, unknown> {
    /** Short string to identify the face. */
    describe?: string;

    /**
     * Whether face is local.
     * @defaultValue false
     */
    local?: boolean;

    /**
     * Whether to allow prefix announcements.
     * @defaultValue true
     * @remarks
     * If `false`, {@link FwFace.addAnnouncement} has no effect.
     */
    advertiseFrom?: boolean;

    /* eslint-disable tsdoc/syntax -- tsdoc-missing-reference */
    /**
     * Whether routes registered on this face would cause FIB to stop matching onto shorter prefixes.
     * @defaultValue true
     * @see {@link \@ndn/endpoint!ProducerOptions.routeCapture}
     */
    /* eslint-enable tsdoc/syntax */
    routeCapture?: boolean;

    [k: string]: unknown;
  }

  /**
   * Describe how to derive route announcement from name prefix in {@link FwFace.addRoute}.
   *
   * @remarks
   * - `false`: no announcement is made.
   * - `true`: same as route name.
   * - number: n-component prefix of route name.
   * - {@link Name} or string: specified name.
   */
  export type RouteAnnouncement = boolean | number | NameLike;

  export type RxTxEventMap = Pick<EventMap, "up" | "down">;

  export interface RxTxBase {
    readonly attributes?: Attributes;

    addEventListener?<K extends keyof RxTxEventMap>(type: K, listener: (ev: RxTxEventMap[K]) => any, options?: AddEventListenerOptions): void;
    removeEventListener?<K extends keyof RxTxEventMap>(type: K, listener: (ev: RxTxEventMap[K]) => any, options?: EventListenerOptions): void;
  }

  /** A logical face with separate RX and TX packet streams. */
  export interface RxTx extends RxTxBase {
    /** RX packet stream received by the logical forwarder. */
    rx: AsyncIterable<FwPacket>;
    /** Function to accept TX packet stream sent by the logical forwarder. */
    tx(iterable: AsyncIterable<FwPacket>): void;
  }

  /** A logical face with duplex RX and TX packet streams. */
  export interface RxTxDuplex extends RxTxBase {
    /**
     * Duplex RX and TX streams.
     * @param iterable - TX packet stream sent by the logical forwarder.
     * @returns RX packet stream received by the logical forwarder.
     */
    duplex(iterable: AsyncIterable<FwPacket>): AsyncIterable<FwPacket>;
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
    case "number": {
      return name.getPrefix(announcement);
    }
    case "boolean": {
      return announcement ? name : undefined;
    }
  }
  return Name.from(announcement);
}

export class FaceImpl extends TypedEventTarget<EventMap> implements FwFace {
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
    fw.dispatchTypedEvent("faceadd", new Forwarder.FaceEvent("faceadd", this));
    fw.faces.add(this);

    void pipeline(
      () => this.txLoop(),
      tap((pkt) => fw.dispatchPacketEvent("pkttx", this, pkt)),
      duplexFromRxTx(rxtx),
      tap((pkt) => fw.dispatchPacketEvent("pktrx", this, pkt)),
      this.rxLoop,
    );

    rxtx.addEventListener?.("up", this.handleLowerUp);
    rxtx.addEventListener?.("down", this.handleLowerDown);
  }

  public close(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.rxtx.removeEventListener?.("up", this.handleLowerUp);
    this.rxtx.removeEventListener?.("down", this.handleLowerDown);

    this.fw.faces.delete(this);
    for (const [name] of this.routes.multiplicities()) {
      this.fw.fib.delete(this, name.valueHex);
    }
    for (const [name] of this.announcements.multiplicities()) {
      this.fw.readvertise.removeAnnouncement(this, name);
    }

    this.txQueue.fail(new Error("close"));
    this.dispatchTypedEvent("close", new Event("close"));
    this.fw.dispatchTypedEvent("facerm", new Forwarder.FaceEvent("facerm", this));
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

    this.fw.dispatchTypedEvent("prefixadd", new Forwarder.PrefixEvent("prefixadd", this, name));
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
    this.fw.dispatchTypedEvent("prefixrm", new Forwarder.PrefixEvent("prefixrm", this, name));
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
    this.dispatchTypedEvent("up", new Event("up"));
  };

  private readonly handleLowerDown = () => {
    this.dispatchTypedEvent("down", new Event("down"));
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
