import { Data, Interest } from "@ndn/l3pkt";

import { Face, FaceImpl } from "./face";
import { Pit } from "./pit";

const DefaultOptions = { ...FaceImpl.DefaultOptions };

export class ForwarderImpl {
  public readonly faces = new Set<FaceImpl>();
  public readonly pit = new Pit();

  constructor(public readonly options: Forwarder.Options) {
  }

  public addFace(face: Face.L3): Face {
    return new FaceImpl(this, face);
  }

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

  public cancelInterest(face: FaceImpl, interest: Interest) {
    const pi = this.pit.lookup(interest, false);
    if (pi) {
      pi.cancelInterest(face);
    }
  }

  public processData(face: FaceImpl, data: Data) {
    this.pit.satisfy(face, data);
  }
}

export interface Forwarder extends Pick<ForwarderImpl, "addFace"> {
  readonly faces: Set<Face>;
}

export namespace Forwarder {
  export function create(options?: Forwarder.Options): Forwarder {
    return new ForwarderImpl(Object.assign({}, DefaultOptions, options));
  }

  export type Options = FaceImpl.Options;

  let defaultInstance: Forwarder|undefined;

  export function getDefault(): Forwarder {
    if (!defaultInstance) {
      defaultInstance = Forwarder.create();
    }
    return defaultInstance;
  }
}
