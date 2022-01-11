import type { Data, Interest, Nack, Name } from "@ndn/packet";
import { EventEmitter } from "node:events";
import type TypedEmitter from "typed-emitter";

import { type FwFace, FaceImpl } from "./face";
import { Fib } from "./fib";
import type { FwPacket } from "./packet";
import { Pit } from "./pit";
import { Readvertise } from "./readvertise";

interface Events {
  /** Emitted before adding face. */
  faceadd: (face: FwFace) => void;
  /** Emitted after removing face. */
  facerm: (face: FwFace) => void;
  /** Emitted before adding prefix to face. */
  prefixadd: (face: FwFace, prefix: Name) => void;
  /** Emitted after removing prefix from face. */
  prefixrm: (face: FwFace, prefix: Name) => void;
  /** Emitted before advertising prefix. */
  annadd: (announcement: Name) => void;
  /** Emitted before withdrawing prefix. */
  annrm: (announcement: Name) => void;
  /** Emitted after packet arrival. */
  pktrx: (face: FwFace, pkt: FwPacket) => void;
  /** Emitted before packet transmission. */
  pkttx: (face: FwFace, pkt: FwPacket) => void;
}

/** Forwarding plane. */
export interface Forwarder extends TypedEmitter<Events> {
  /** Node names, used in forwarding hint processing. */
  readonly nodeNames: Name[];

  /** Logical faces. */
  readonly faces: Set<FwFace>;

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
    /** Per-face RX buffer length. */
    faceRxBuffer?: number;
    /** Per-face TX buffer length. */
    faceTxBuffer?: number;

    /** Whether to try matching Data without PIT token. */
    dataNoTokenMatch?: boolean;
  }

  export const DefaultOptions: Required<Options> = {
    faceRxBuffer: 16,
    faceTxBuffer: 16,
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
}

export class ForwarderImpl extends (EventEmitter as new() => TypedEmitter<Events>) implements Forwarder {
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
  }
}
