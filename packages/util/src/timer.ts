function timeoutAbortSignalFallback(time: number): AbortSignal {
  // Node.js 16.x lacks global DOMException, but it has AbortSignal.timeout so this fallback won't
  // be called. As of 20220601, this fallback is needed for Chrome, etc.
  const abort = new AbortController();
  setTimeout(() => abort.abort(new DOMException("TimeoutError", "TimeoutError")), time);
  return abort.signal;
}

/** AbortSignal.timeout ponyfill. */
export const timeoutAbortSignal: (time: number) => AbortSignal = (AbortSignal as any).timeout ?? timeoutAbortSignalFallback;
