import { timingSafeEqual as platformTimingSafeEqual } from "./platform_node";

/** Timing-safe equality comparison. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.byteLength === b.byteLength && platformTimingSafeEqual(a, b);
}

/** Compute SHA256 digest. */
export async function sha256(input: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", input);
  return new Uint8Array(digest);
}
