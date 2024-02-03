import { createPrivateKey } from "node:crypto";

/** Create EncryptedPrivateKeyInfo. */
export async function create(privateKey: Uint8Array, passphrase: string | Uint8Array): Promise<Uint8Array> {
  const key = createPrivateKey({
    key: Buffer.from(privateKey),
    type: "pkcs8",
    format: "der",
  });
  return key.export({
    type: "pkcs8",
    format: "der",
    cipher: "aes-256-cbc",
    passphrase: Buffer.from(passphrase),
  });
}

/** Decrypt EncryptedPrivateKeyInfo. */
export async function decrypt(encryptedKey: Uint8Array, passphrase: string | Uint8Array): Promise<Uint8Array> {
  const key = createPrivateKey({
    key: Buffer.from(encryptedKey),
    type: "pkcs8",
    format: "der",
    passphrase: Buffer.from(passphrase),
  });
  return key.export({
    type: "pkcs8",
    format: "der",
  });
}
