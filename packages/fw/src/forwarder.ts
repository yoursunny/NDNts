import { Data, Interest, Nack, Name } from "@ndn/packet";
import EventEmitter from "events";
import StrictEventEmitter from "strict-event-emitter-types";

import { Face, FaceImpl } from "./face";
import { Fib, FibEntry } from "./fib";
import { Pit } from "./pit";

interface Events {
  /** Emitted before adding face. */
  faceadd: Face;
  /** Emitted after removing face. */
  facerm: Face;
  /** Emitted before adding prefix to face. */
  prefixadd: (face: Face, prefix: Name) => void;
  /** Emitted after removing prefix from face. */
  prefixrm: (face: Face, prefix: Name) => void;
  /** Emitted before advertising prefix. */
  annadd: Name;
  /** Emitted before withdrawing prefix. */
  annrm: Name;
  /** Emitted after packet arrival. */
  pktrx: (face: Face, pkt: Face.Rxable) => void;
  /** Emitted before packet transmission. */
  pkttx: (face: Face, pkt: Face.Txable) => void;
}

type Emitter = StrictEventEmitter<EventEmitter, Events>;

export class ForwarderImpl extends (EventEmitter as new() => Emitter) {
  public readonly faces = new Set<FaceImpl>();
  public readonly fib = new Fib(this);
  public readonly pit = new Pit();

  constructor(public readonly options: Forwarder.Options) {
    super();
  }

  /** Add a face to the forwarding plane. */
  public addFace(face: Face.Base, attributes: Face.Attributes = {}): Face {
    return new FaceImpl(this, face, attributes);
  }

  /** Process incoming Interest. */
  public processInterest(face: FaceImpl, interest: Interest) {
    const pi = this.pit.lookup(interest);
    pi.receiveInterest(face, interest);

    const fibEntry = this.fib.lpm(interest.name);
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
  public cancelInterest(face: FaceImpl, interest: Interest) {
    const pi = this.pit.lookup(interest, false);
    pi?.cancelInterest(face);
  }

  /** Process incoming Data. */
  public processData(face: FaceImpl, data: Data) {
    this.pit.satisfy(face, data);
  }

  /** Process incoming Nack. */
  public processNack(face: FaceImpl, nack: Nack) {
    // ignore Nack
  }

  public advertisePrefix(fibEntry: FibEntry) {
    this.emit("annadd", fibEntry.name);
    for (const face of this.faces) {
      face.advertise?.advertise(fibEntry);
    }
  }

  public withdrawPrefix(fibEntry: FibEntry) {
    this.emit("annrm", fibEntry.name);
    for (const face of this.faces) {
      face.advertise?.withdraw(fibEntry);
    }
  }
}

/** Forwarding plane. */
export interface Forwarder extends Pick<ForwarderImpl, "addFace"|Exclude<keyof Emitter, "emit">> {
  readonly faces: Set<Face>;
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
