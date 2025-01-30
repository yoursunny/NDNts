import assert from "tiny-invariant";

/**
 * Create a random jitter generator function.
 * @param r - Jitter factor around median.
 * @param x - Median value.
 * @returns Jitter generator function.
 *
 * @remarks
 * Each time the returned jitter generator function is called, it returns a number within
 * `[x*(1-r), x*(1+r)]` range. For example, `randomJitter(0.1, 2)` creates a jitter generator
 * function that returns random values within `[1.8, 2.2]` range.
 */
export function randomJitter(r: number, x = 1): () => number {
  r = Math.max(0, Math.min(r, 1));
  if (r === 0) {
    return () => x;
  }

  const min = 1 - r;
  const distance = 2 * r;
  return () => x * (min + distance * Math.random());
}
export namespace randomJitter {
  /** Create a random generator function between `[min,max]`. */
  export function between(min: number, max: number): () => number {
    const distance = max - min;
    assert(distance >= 0);

    if (distance === 0) {
      return () => min;
    }
    return () => min + distance * Math.random();
  }
}
