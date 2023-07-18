import type { Data, Interest, Nack, Name } from "@ndn/packet";
import { TypedEventTarget } from "typescript-event-target";

import { FaceImpl, type FwFace } from "./face";
import { Fib } from "./fib";
import type { FwPacket } from "./packet";
import { Pit } from "./pit";
import { Readvertise } from "./readvertise";

type EventMap = {
  /** Emitted before adding face. */
  faceadd: Forwarder.FaceEvent;
  /** Emitted after removing face. */
  facerm: Forwarder.FaceEvent;
  /** Emitted before adding prefix to face. */
  prefixadd: Forwarder.PrefixEvent;
  /** Emitted after removing prefix from face. */
  prefixrm: Forwarder.PrefixEvent;
  /** Emitted before advertising prefix. */
  annadd: Forwarder.AnnouncementEvent;
  /** Emitted before withdrawing prefix. */
  annrm: Forwarder.AnnouncementEvent;
  /** Emitted after packet arrival. */
  pktrx: Forwarder.PacketEvent;
  /** Emitted before packet transmission. */
  pkttx: Forwarder.PacketEvent;
};

/** Forwarding plane. */
export interface Forwarder extends TypedEventTarget<EventMap> {
  /** Node names, used in forwarding hint processing. */
  readonly nodeNames: Name[];

  /** Logical faces. */
  readonly faces: ReadonlySet<FwFace>;

  /** Add a logical face to the forwarding plane. */
  addFace(face: FwFace.RxTx | FwFace.RxTxDuplex, attributes?: FwFace.Attributes): FwFace;

  /**
   * Cancel timers and other I/O resources.
   * This instance should not be used after this operation.
   */
  close(): void;
}
export namespace Forwarder {
  export interface Options {
    /** Whether to try matching Data without PIT token. */
    dataNoTokenMatch?: boolean;
  }

  export const DefaultOptions: Required<Options> = {
    dataNoTokenMatch: true,
  };

  /** Create a new forwarding plane. */
  export function create(options?: Options): Forwarder {
    return new ForwarderImpl({ ...DefaultOptions, ...options });
  }

  let defaultInstance: Forwarder | undefined;

  /** Access the default forwarding plane instance. */
  export function getDefault(): Forwarder {
    if (!defaultInstance) {
      defaultInstance = Forwarder.create();
    }
    return defaultInstance;
  }

  /** Replace the default forwarding plane instance. */
  export function replaceDefault(fw?: Forwarder): void {
    defaultInstance = fw;
  }

  /** Delete default instance (mainly for unit testing). */
  export function deleteDefault() {
    if (!defaultInstance) {
      return;
    }
    defaultInstance.close();
    defaultInstance = undefined;
  }

  /** Face event. */
  export class FaceEvent extends Event {
    constructor(type: string, public readonly face: FwFace) {
      super(type);
    }
  }

  /** Prefix registration event. */
  export class PrefixEvent extends Event {
    constructor(type: string, public readonly face: FwFace, public readonly prefix: Name) {
      super(type);
    }
  }

  /** Prefix announcement event. */
  export class AnnouncementEvent extends Event {
    constructor(type: string, public readonly name: Name) {
      super(type);
    }
  }

  /** Packet event. */
  export class PacketEvent extends Event {
    constructor(type: string, public readonly face: FwFace, public readonly packet: FwPacket) {
      super(type);
    }
  }
}

export class ForwarderImpl extends TypedEventTarget<EventMap> implements Forwarder {
  public readonly nodeNames: Name[] = [];
  public readonly faces = new Set<FaceImpl>();
  public readonly fib = new Fib();
  public readonly pit: Pit;
  public readonly readvertise = new Readvertise(this);

  constructor(public readonly opts: Required<Forwarder.Options>) {
    super();
    this.pit = new Pit(opts.dataNoTokenMatch);
  }

  public addFace(face: FwFace.RxTx | FwFace.RxTxDuplex, attributes: FwFace.Attributes = {}): FwFace {
    return new FaceImpl(this, face, attributes);
  }

  private pickInterestForwardingName(interest: Interest): Name {
    const fhName = interest.fwHint?.delegations[0];
    if (fhName && this.nodeNames.every((nodeName) => !fhName.isPrefixOf(nodeName))) {
      return fhName;
    }
    return interest.name;
  }

  /** Process incoming Interest. */
  public processInterest(face: FaceImpl, pkt: FwPacket<Interest>) {
    const pi = this.pit.lookup(pkt);
    pi.receiveInterest(face, pkt);

    const fwName = this.pickInterestForwardingName(pkt.l3);
    for (const nh of this.fib.lookup(fwName)) {
      if (nh !== face) {
        pi.forwardInterest(nh);
      }
    }
  }

  /** Process incoming cancel Interest request. */
  public cancelInterest(face: FaceImpl, pkt: FwPacket<Interest>) {
    const pi = this.pit.lookup(pkt, false);
    pi?.cancelInterest(face);
  }

  /** Process incoming Data. */
  public processData(face: FaceImpl, pkt: FwPacket<Data>) {
    void this.pit.satisfy(face, pkt);
  }

  /** Process incoming Nack. */
  public processNack(face: FaceImpl, nack: FwPacket<Nack>) {
    // ignore Nack
    void face;
    void nack;
  }

  public close(): void {
    this.pit.close();
    this.readvertise.close();
    for (const face of this.faces) {
      face.close();
    }
  }
}
