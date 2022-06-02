export const console = globalThis.console;
export const crypto = globalThis.crypto;

// https://codahale.com/a-lesson-in-timing-attacks/
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  // length has been checked by caller
  let result = 0;
  for (let i = 0; i < a.byteLength; ++i) {
    result |= a[i]! ^ b[i]!;
  }
  return result === 0;
}

export function delay<T = void>(time: number, value?: T): Promise<T> {
  return new Promise<T>((resolve) => {
    setTimeout(() => resolve(value!), time);
  });
}
