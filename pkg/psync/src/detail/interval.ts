import { assert } from "@ndn/util";

export type IntervalRange = [min: number, max: number];

export type IntervalFunc = () => number;

export function computeInterval(input: IntervalRange | undefined, syncInterestLifetime: number): IntervalFunc {
  let [min, range] = [syncInterestLifetime / 2 + 100, 400];
  if (input) {
    min = input[0];
    range = input[1] - min;
    assert(range >= 0);
  }
  return () => (min + Math.random() * range);
}
