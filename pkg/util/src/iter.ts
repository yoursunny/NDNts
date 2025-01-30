import EventIterator from "event-iterator";
import type { AnyIterable } from "streaming-iterables";
import assert from "tiny-invariant";

/** An iterable that you can push values into. */
export interface Pushable<T> extends AsyncIterable<T> {
  /** Push a value. */
  push: (value: T) => void;

  /** End the iterable normally. */
  stop: () => void;

  /** End the iterable abnormally. */
  fail: (err: Error) => void;
}

/**
 * Create an iterable that you can push values into.
 * @typeParam T - Value type.
 * @returns AsyncIterable with push method.
 *
 * @remarks
 * Inspired by {@link https://www.npmjs.com/package/it-pushable | it-pushable} but implemented on
 * top of {@link https://www.npmjs.com/package/event-iterator | event-iterator} library.
 */
export function pushable<T>(): Pushable<T> {
  let q!: Parameters<ConstructorParameters<typeof EventIterator<T>>[0]>[0];
  const ei = new EventIterator<T>((queue) => { q = queue; }, { highWaterMark: Infinity });
  const it = ei[Symbol.asyncIterator]();
  assert(!!q);
  return {
    [Symbol.asyncIterator]: () => it,
    push: q.push,
    stop: q.stop,
    fail: q.fail,
  };
}

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

/**
 * Retrieve or insert value in a Map-like container.
 * @param ct - Map-like container.
 * @param key - Map key.
 * @param make - Function to create the value if needed.
 * @returns Existing or newly created value.
 */
export function getOrInsert<C extends getOrInsert.Container>(
    ct: C, key: Parameters<C["get"]>[0] & Parameters<C["set"]>[0],
    make: () => Parameters<C["set"]>[1],
): Parameters<C["set"]>[1] {
  let value = ct.get(key);
  if (value === undefined) {
    ct.set(key, value = make());
  }
  return value;
}
export namespace getOrInsert {
  export interface Container {
    get: (key: any) => any | undefined;
    set: (key: any, value: any) => void;
  }
}

/**
 * Delete keys from a Set or Map until its size is below capacity.
 * @param capacity - Maximum size after eviction.
 * @param ct - Container.
 * @param deleteCallback - Callback before item is deleted.
 */
export function evict<K>(
    capacity: number,
    ct: evict.Container<K>,
    deleteCallback?: (key: K) => void,
): void {
  assert(capacity >= 0);
  for (const key of ct.keys()) {
    if (ct.size <= capacity) {
      break;
    }
    deleteCallback?.(key);
    ct.delete(key);
  }
}
export namespace evict {
  export type Container<K> = Pick<Set<K> & Map<K, unknown>, "delete" | "size" | "keys">;
}
