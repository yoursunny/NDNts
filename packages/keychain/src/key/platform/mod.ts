import { Crypto as peculiarCrypto } from "@peculiar/webcrypto";
import { timingSafeEqual as nodeTimingSafeEqual } from "crypto";

export const crypto = new peculiarCrypto() as Crypto; // export as DOM Crypto type

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  return nodeTimingSafeEqual(a, b);
}
