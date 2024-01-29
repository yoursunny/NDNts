import assert from "minimalistic-assert";
import type { AnyIterable } from "streaming-iterables";

/**
 * Yield all values from an iterable but catch any error.
 * @param iterable - Input iterable.
 * @param onError - Callback to receive errors thrown by the iterable.
 * @returns Iterable that does not throw errors.
 */
export async function* safeIter<T>(
    iterable: AnyIterable<T>,
    onError?: (err?: unknown) => void,
): AsyncIterableIterator<T> {
  try {
    yield* iterable;
  } catch (err: unknown) {
    onError?.(err);
  }
}

/**
 * Perform flatMap on an (async) iterable, but flatten at most once.
 * @remarks
 * flatMap of streaming-iterables recursively flattens the result.
 * This function flattens at most once.
 */
export async function* flatMapOnce<T, R>(
    f: (item: T) => AnyIterable<R>,
    iterable: AnyIterable<T>,
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
  export type Container<K> = Pick<Set<K> & Map<K, unknown>, "delete" | "size" | "keys">;
}
