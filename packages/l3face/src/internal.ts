import { AnyIterable } from "streaming-iterables";

async function* mapFilter_<T, B>(func: (data: T) => B|undefined|Promise<B|undefined>,
                                 iterable: AnyIterable<T>): AsyncIterableIterator<B> {
  for await (const val of iterable) {
    const mapped = await func(val);
    if (typeof mapped !== "undefined") {
      yield mapped;
    }
  }
}

export function mapFilter<T, B>(func: (data: T) => B|undefined|Promise<B|undefined>)
                : (iterable: AnyIterable<T>) => AsyncIterableIterator<B>;
export function mapFilter<T, B>(func: (data: T) => B|undefined|Promise<B|undefined>,
                                iterable: AnyIterable<T>): AsyncIterableIterator<B>;
export function mapFilter<T, B>(func: (data: T) => B|undefined|Promise<B|undefined>,
                                iterable?: AnyIterable<T>) {
  if (iterable === undefined) {
    return (curriedIterable) => mapFilter_(func, curriedIterable);
  }
  return mapFilter_(func, iterable);
}
