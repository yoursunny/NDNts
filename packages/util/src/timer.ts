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
  const min = 1 - r;
  const distance = 2 * r;
  return () => x * (min + distance * Math.random());
}

function timeoutAbortSignalFallback(time: number): AbortSignal {
  // Node.js 16.x lacks global DOMException, but it has AbortSignal.timeout so this fallback won't
  // be called. As of 20220601, this fallback is needed for Chrome, etc.
  const abort = new AbortController();
  setTimeout(() => abort.abort(new DOMException("TimeoutError", "TimeoutError")), time);
  return abort.signal;
}

/** AbortSignal.timeout ponyfill. */
export const timeoutAbortSignal: (time: number) => AbortSignal = (AbortSignal as any).timeout ?? timeoutAbortSignalFallback;
