import { CertStore, KeyStore, SCloneCertStore } from "../../store";
import { IdbStoreImpl } from "./store";

export const crypto = self.crypto;

// https://codahale.com/a-lesson-in-timing-attacks/
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.byteLength; ++i) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

export function openStores(locator: string): [KeyStore, CertStore] {
  return [
    new KeyStore(new IdbStoreImpl(`${locator} 2dc9febb-a01a-4543-8180-f03d24bea8f6`)),
    new SCloneCertStore(new IdbStoreImpl(`${locator} ecf40b97-07cb-4b4d-92ed-adcbaa0a9855`)),
  ];
}
