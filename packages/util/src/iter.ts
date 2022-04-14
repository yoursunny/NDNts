/** Yield all values from an iterable but catch any error. */
export async function* safeIter<T>(
    iterable: AsyncIterable<T>,
    onError?: (err?: unknown) => void,
): AsyncIterableIterator<T> {
  try {
    yield* iterable;
  } catch (err: unknown) {
    onError?.(err);
  }
}

/**
 * Map and flatten once.
 * This differs from flatMap in streaming-iterables, which recursively flattens the result.
 */
export async function* flatMapOnce<T, R>(
    f: (item: T) => Iterable<R> | AsyncIterable<R>,
    iterable: AsyncIterable<T>,
): AsyncIterable<R> {
  for await (const item of iterable) {
    yield* f(item);
  }
}
