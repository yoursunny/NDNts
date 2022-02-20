import { crypto, timingSafeEqual as platformTimingSafeEqual } from "./platform_node";

/** Timing-safe equality comparison. */
export function timingSafeEqual(a: BufferSource, b: BufferSource): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }

  // Node accepts BufferSource but Node typing only accepts ArrayBufferView
  return platformTimingSafeEqual(a as Uint8Array, b as Uint8Array);
}

/** SHA256 digest. */
export async function sha256(input: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", input);
  return new Uint8Array(digest);
}
