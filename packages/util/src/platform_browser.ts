import { asUint8Array } from "./buffer";

export const crypto = globalThis.crypto;

// https://codahale.com/a-lesson-in-timing-attacks/
export function timingSafeEqual(sa: BufferSource, sb: BufferSource): boolean {
  const a = asUint8Array(sa);
  const b = asUint8Array(sb);

  let result = 0;
  for (let i = 0; i < a.byteLength; ++i) {
    result |= a[i]! ^ b[i]!;
  }
  return result === 0;
}

export const console = globalThis.console;
