import { Data } from "@ndn/l3pkt";

export namespace PitImpl {
  export const SATISFY = Symbol("PitImpl.SATISFY");
  export const REMOVE = Symbol("PitImpl.REMOVE");

  export interface PendingInterest {
    /** Satisfy Interest with Data. */
    [SATISFY](data: Data);
  }

  export interface Table {
    /** Remove from table. */
    [REMOVE](pi: PendingInterest);
  }
}
