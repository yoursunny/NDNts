import { Crypto as peculiarCrypto } from "@peculiar/webcrypto";
import { timingSafeEqual as nodeTimingSafeEqual } from "crypto";

import { CertificateStore, PrivateKeyStore } from "../../store/internal";
import { FileCertificateStore, FilePrivateKeyStore } from "./store";

export const crypto = new peculiarCrypto() as Crypto; // export as DOM Crypto type

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  return nodeTimingSafeEqual(a, b);
}

export function openStores(locator: string): [PrivateKeyStore, CertificateStore] {
  return [
    new FilePrivateKeyStore(`${locator}/831e5c8f-9d63-40f3-8359-0f55254eeb80.json`),
    new FileCertificateStore(`${locator}/c339669f-8d4b-4cb3-a8c2-09af61edd787.json`),
  ];
}
