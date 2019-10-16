import { Data, Interest } from "@ndn/l3pkt";

import { Face, FaceImpl } from "./face";
import { Pit } from "./pit";

const DefaultOptions = { ...FaceImpl.DefaultOptions };

export class ForwarderImpl {
  public readonly faces = new Set<FaceImpl>();
  public readonly pit = new Pit();

  constructor(public readonly options: Forwarder.Options) {
  }

  /** Add a face to the forwarding plane. */
  public addFace(face: Face.Base): Face {
    return new FaceImpl(this, face);
  }

  /** Process incoming Interest. */
  public processInterest(face: FaceImpl, interest: Interest, token: any) {
    const pi = this.pit.lookup(interest);
    pi.receiveInterest(face, interest, token);

    for (const nh of this.faces) {
      if (nh === face) {
        continue;
      }
      const prefixLength = nh.findRoute(interest.name);
      if (prefixLength >= 0) {
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
}

/** Forwarding plane. */
export interface Forwarder extends Pick<ForwarderImpl, "addFace"> {
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
