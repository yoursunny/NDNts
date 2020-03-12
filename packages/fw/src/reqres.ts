import { Data, Interest, Nack } from "@ndn/packet";

export type L3Pkt = Interest|Data|Nack;

export function isL3Pkt(pkt: unknown): pkt is L3Pkt {
  return pkt instanceof Interest || pkt instanceof Data || pkt instanceof Nack;
}

/** Application-defined opaque token attached to a packet. */
export namespace InterestToken {
  const map = new WeakMap();

  export function get<T>(pkt: object): T|undefined {
    return map.get(pkt);
  }

  export function set<H extends object>(pkt: H, token?: unknown): H {
    if (typeof token === "undefined") {
      map.delete(pkt);
    } else {
      map.set(pkt, token);
    }
    return pkt;
  }

  export function copy<F extends object, H extends object>(from: F, to: H): H {
    return set(to, get(from));
  }

  export function copyProxied<F extends object, H extends object>(from: F, to: H): H {
    return copy(from, new Proxy(to, {}));
  }
}

/** Indicate an Interest has been rejected. */
export class RejectInterest {
  constructor(public readonly reason: RejectInterest.Reason, public readonly interest: Interest, token: unknown) {
    InterestToken.set(this, token);
  }
}

export namespace RejectInterest {
  export type Reason = "cancel"|"expire";
}

/** Request to cancel a pending Interest. */
export class CancelInterest {
  constructor(public readonly interest: Interest) {
  }
}
