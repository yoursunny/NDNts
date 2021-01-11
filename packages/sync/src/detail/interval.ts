import assert from "minimalistic-assert";

export type IntervalRange = [min: number, max: number];

export type IntervalFunc = () => number;

export function computeInterval(input: IntervalRange|undefined, syncInterestLifetime: number): IntervalFunc {
  const [min, range] = (() => {
    if (input) {
      const [min, max] = input;
      assert(min <= max);
      return [min, max - min];
    }
    return [syncInterestLifetime / 2 + 100, 400];
  })() as [number, number];
  return () => (min + Math.random() * range);
}
