import assert from "tiny-invariant";

export function concatBuffers(list: readonly Uint8Array[], totalLength?: number): Uint8Array {
  totalLength ??= list.reduce((l, { byteLength }) => l + byteLength, 0);
  const c = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of list) {
    c.set(part, offset);
    offset += part.byteLength;
  }
  assert(offset === totalLength);
  return c;
}

export const console = globalThis.console;

export function delay<T = void>(after: number, value?: T): Promise<T> {
  return new Promise<T>((resolve) => setTimeout(resolve, after, value));
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  // length has been checked by caller
  // https://codahale.com/a-lesson-in-timing-attacks/
  let result = 0;
  for (let i = 0; i < a.byteLength; ++i) {
    result |= a[i]! ^ b[i]!;
  }
  return result === 0;
}
