import { createHash, randomBytes, timingSafeEqual as nodeTimingSafeEqual } from "crypto";

export function randBytes(size: number): Uint8Array {
  return randomBytes(size);
}

export async function sha256(input: Uint8Array): Promise<Uint8Array> {
  const hash = createHash("sha256");
  hash.update(input);
  return hash.digest();
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  return nodeTimingSafeEqual(a, b);
}
