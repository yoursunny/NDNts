export const crypto = self.crypto;

// https://codahale.com/a-lesson-in-timing-attacks/
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.byteLength; ++i) {
    // tslint:disable-next-line no-bitwise
    result |= a[i] ^ b[i];
  }
  return result === 0;
}
