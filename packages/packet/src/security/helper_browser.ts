const crypto = globalThis.crypto;

export function randBytes(size: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(size));
}

export async function sha256(input: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", input);
  return new Uint8Array(digest);
}

// https://codahale.com/a-lesson-in-timing-attacks/
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.byteLength; ++i) {
    result |= a[i]! ^ b[i]!;
  }
  return result === 0;
}
