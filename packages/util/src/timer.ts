/**
 * Create a random jitter generator function.
 * @param r jitter factor around 1.
 * @param x median value.
 * @returns jitter generator function.
 *
 * randomJitter(0.1, 2) generates random values within [1.8, 2.2].
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
