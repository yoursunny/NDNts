import { Data, Interest } from "@ndn/l3pkt";

export namespace InterestToken {
  export const TAG = Symbol("InterestToken");

  export interface Tagged<T = any> {
    [TAG]: T;
  }

  export function get<T>(obj: { [TAG]: T }): T {
    return obj[TAG];
  }

  export function set<T, H extends object>(obj: H, token: T): H & {[TAG]: T} {
    return Object.assign(obj, { [TAG]: token });
  }
}

export type InterestRequest = Interest & InterestToken.Tagged;

export type DataResponse = Data & InterestToken.Tagged<any[]>;

export type RejectInterestReason = "cancel"|"expire";

export class RejectInterest {
  public [InterestToken.TAG]: any;

  constructor(public readonly reason: RejectInterestReason, token: any) {
    InterestToken.set(this, token);
  }
}

export class CancelInterest {
  constructor(public readonly interest: Interest) {
  }
}
