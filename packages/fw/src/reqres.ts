import { Data, Interest } from "@ndn/l3pkt";

export const InterestToken = Symbol("Forwarder.InterestToken");

export type InterestRequest = Interest & { [InterestToken]?: any; };

export type DataResponse = Data & { [InterestToken]: any[]; };

export type RejectInterestReason = "cancel"|"expire";

export interface RejectInterest {
  reject: RejectInterestReason;
  [InterestToken]: any;
}

export class CancelInterest {
  constructor(public readonly interest: Interest) {
  }
}

export type Rxable = InterestRequest|Data|CancelInterest;

export type Txable = Interest|DataResponse|RejectInterest;
