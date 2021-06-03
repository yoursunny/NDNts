export async function* safe<T>(iterable: AsyncIterable<T>): AsyncIterable<T> {
  try { yield* iterable; } catch {}
}
