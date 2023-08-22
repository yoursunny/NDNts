import type { Data, Interest, Nack } from "@ndn/packet";

type L3Pkt = Interest | Data | Nack;

/** A logical packet in the forwarder. */
export interface FwPacket<T extends L3Pkt = L3Pkt> {
  l3: T;
  token?: unknown;
  congestionMark?: number;
  reject?: RejectInterest.Reason;
  cancel?: boolean;
}
export namespace FwPacket {
  export function create<T extends L3Pkt>(l3: T, token?: unknown, congestionMark?: number): FwPacket<T> {
    return { l3, token, congestionMark };
  }

  /** Whether this is a plain packet that can be sent on the wire. */
  export function isEncodable({ reject, cancel }: FwPacket): boolean {
    return !reject && !cancel;
  }
}

/** Indicate an Interest has been rejected. */
export class RejectInterest implements FwPacket<Interest> {
  constructor(
      public reject: RejectInterest.Reason,
      public l3: Interest,
      public token?: unknown,
  ) {}
}
export namespace RejectInterest {
  export type Reason = "cancel" | "expire";
}

/** Request to cancel a pending Interest. */
export class CancelInterest implements FwPacket<Interest> {
  constructor(
      public l3: Interest,
      public token?: unknown,
  ) {}

  public readonly cancel = true;
}
