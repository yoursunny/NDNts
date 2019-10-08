import { canSatisfySync, Data, Interest } from "@ndn/l3pkt";
import assert from "minimalistic-assert";

import { PitImpl } from "./internal";
import { PendingInterest } from "./pending-interest";
import { Pit } from "./pit";

/**
 * PIT implemented with an array.
 *
 * This implementation does not support Interest aggregation or loop prevention.
 * Each Interest is appended to an array.
 * Each Data is matched against all pending Interests.
 */
export class LinearPit implements Pit {
  public get length() { return this.table.length; }

  private table: PendingInterest[] = [];

  public addInterest(interest: Interest): PendingInterest {
    const pi = new PendingInterest(this, interest);
    this.table.push(pi);
    return pi;
  }

  public processData(data: Data): void {
    let needDigest = false;
    this.table = this.table.filter((pi) => {
      const satisfied = canSatisfySync(pi.interest, data);
      if (satisfied === true) {
        pi[PitImpl.SATISFY](data);
        return false;
      }
      needDigest = needDigest || satisfied !== false;
      return true;
    });
    if (needDigest) {
      data.computeImplicitDigest()
      .then(() => this.processData(data));
    }
  }

  public [PitImpl.REMOVE](pi: PitImpl.PendingInterest) {
    const i = this.table.findIndex((item) => item === pi);
    assert(i >= 0, "PendingInterest is not in PIT");
    this.table.splice(i, 1);
  }
}
