import { Crypto as peculiarCrypto } from "@peculiar/webcrypto";
import { timingSafeEqual as nodeTimingSafeEqual } from "crypto";

import { CertificateStorage, PrivateKeyStorage } from "../storage";
import { FileCertificateStorage } from "./file-certificate-storage";
import { FilePrivateKeyStorage } from "./file-private-key-storage";

export const crypto = new peculiarCrypto() as Crypto; // export as DOM Crypto type

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  return nodeTimingSafeEqual(a, b);
}

export function openStorage(locator: string): [PrivateKeyStorage, CertificateStorage] {
  return [new FilePrivateKeyStorage(locator), new FileCertificateStorage(locator)];
}
