import { Interest } from "@ndn/l3pkt";

export class CancelInterest {
  constructor(public readonly interest: Interest) {
  }
}
