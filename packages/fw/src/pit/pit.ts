import { Data, Interest } from "@ndn/l3pkt";
import { PendingInterest } from "./pending-interest";

/** Pending Interest Table. */
export interface Pit {
  readonly length: number;

  /**
   * Add an Interest.
   * Return PendingInterest if accepted, or undefined if loop detected.
   */
  addInterest(interest: Interest, from: PropertyKey): PendingInterest|undefined;

  /** Asynchronously process incoming Data. */
  processData(data: Data, from: PropertyKey): void;
}
