import assert from "minimalistic-assert";

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
    iterable: Iterable<T> | AsyncIterable<T>,
): AsyncIterable<R> {
  for await (const item of iterable) {
    yield* f(item);
  }
}

/** Delete keys from a Set or Map until its size is below capacity. */
export function evict<K>(capacity: number, ct: evict.Container<K>): void {
  assert(capacity >= 0);
  for (const key of ct.keys()) {
    if (ct.size <= capacity) {
      break;
    }
    ct.delete(key);
  }
}
export namespace evict {
  export type Container<K> = Pick<Set<K>, "delete" | "size" | "keys">;
}
