import { Data, Interest } from "@ndn/l3pkt";
import { Name } from "@ndn/name";
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

const DefaultOptions = { ...FaceImpl.DefaultOptions };

export class ForwarderImpl extends (EventEmitter as new() => Emitter) {
  public readonly faces = new Set<FaceImpl>();
  public readonly fib = new Fib(this);
  public readonly pit = new Pit();

  constructor(public readonly options: Forwarder.Options) {
    super();
  }

  /** Add a face to the forwarding plane. */
  public addFace(face: Face.Base): Face {
    return new FaceImpl(this, face);
  }

  /** Process incoming Interest. */
  public processInterest(face: FaceImpl, interest: Interest, token: any) {
    const pi = this.pit.lookup(interest);
    pi.receiveInterest(face, interest, token);

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
    if (pi) {
      pi.cancelInterest(face);
    }
  }

  /** Process incoming Data. */
  public processData(face: FaceImpl, data: Data) {
    this.pit.satisfy(face, data);
  }

  public advertisePrefix(fibEntry: FibEntry) {
    this.emit("annadd", fibEntry.name);
    for (const face of this.faces) {
      if (face.advertise) {
        face.advertise.advertise(fibEntry);
      }
    }
  }

  public withdrawPrefix(fibEntry: FibEntry) {
    this.emit("annrm", fibEntry.name);
    for (const face of this.faces) {
      if (face.advertise) {
        face.advertise.withdraw(fibEntry);
      }
    }
  }
}

/** Forwarding plane. */
export interface Forwarder extends Pick<ForwarderImpl, "addFace"|Exclude<keyof Emitter, "emit">> {
  readonly faces: Set<Face>;
}

export namespace Forwarder {
  export type Options = FaceImpl.Options;

  /** Create a new forwarding plane. */
  export function create(options?: Options): Forwarder {
    return new ForwarderImpl(Object.assign({}, DefaultOptions, options));
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
