import { Data, Interest } from "@ndn/packet";

/** Application-defined opaque token attached to a packet. */
export namespace InterestToken {
  export const TAG = Symbol("InterestToken");

  export interface Tagged<T = any> {
    [TAG]: T;
  }

  export function get<T>(obj: Tagged<T>): T {
    return obj[TAG];
  }

  export function set<T, H extends object>(obj: H, token: T): H & Tagged<T> {
    return Object.assign(obj, { [TAG]: token });
  }
}

/** Interest with optional application-defined token. */
export type InterestRequest<T = any> = Interest & InterestToken.Tagged<T>;

/** Data with application-defined tokens from satisfied Interests. */
export type DataResponse<T = any> = Data & InterestToken.Tagged<T[]>;

/** Indicate an Interest has been rejected. */
export class RejectInterest<T = any> {
  public [InterestToken.TAG]: T;

  constructor(public readonly reason: RejectInterest.Reason, public readonly interest: Interest, token: T) {
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
