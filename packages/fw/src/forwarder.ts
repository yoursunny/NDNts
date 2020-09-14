import { Data, Interest, Nack, Name } from "@ndn/packet";
import { EventEmitter } from "events";
import type TypedEmitter from "typed-emitter";

import { FaceImpl, FwFace } from "./face";
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

export class ForwarderImpl extends (EventEmitter as new() => TypedEmitter<Events>) {
  public readonly faces = new Set<FaceImpl>();
  public readonly fib = new Fib();
  public readonly pit = new Pit();
  public readonly readvertise = new Readvertise(this);

  constructor(public readonly options: Forwarder.Options) {
    super();
  }

  /** Add a face to the forwarding plane. */
  public addFace(face: FwFace.RxTx|FwFace.RxTxTransform, attributes: FwFace.Attributes = {}): FwFace {
    return new FaceImpl(this, face, attributes);
  }

  /** Process incoming Interest. */
  public processInterest(face: FaceImpl, pkt: FwPacket<Interest>) {
    const pi = this.pit.lookup(pkt);
    pi.receiveInterest(face, pkt);

    const fibEntry = this.fib.lpm(pkt.l3.name);
    if (!fibEntry) {
      return;
    }
    for (const nh of fibEntry.nexthops) {
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
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.pit.satisfy(face, pkt);
  }

  /** Process incoming Nack. */
  public processNack(face: FaceImpl, nack: FwPacket<Nack>) {
    // ignore Nack
  }
}

/** Forwarding plane. */
export interface Forwarder extends Pick<ForwarderImpl,
"addFace"|Exclude<keyof TypedEmitter<Events>, "emit">> {
  readonly faces: Set<FwFace>;
  readonly pit: Pick<Pit, "dataNoTokenMatch">;
}

export namespace Forwarder {
  export type Options = FaceImpl.Options;

  const DefaultOptions = { ...FaceImpl.DefaultOptions };

  /** Create a new forwarding plane. */
  export function create(options?: Options): Forwarder {
    return new ForwarderImpl({ ...DefaultOptions, ...options });
  }

  let defaultInstance: Forwarder|undefined;

  /** Access the default forwarding plane instance. */
  export function getDefault(): Forwarder {
    if (!defaultInstance) {
      defaultInstance = Forwarder.create();
    }
    return defaultInstance;
  }

  /** Delete default instance (mainly for unit testing). */
  export function deleteDefault() {
    defaultInstance = undefined;
  }
}
