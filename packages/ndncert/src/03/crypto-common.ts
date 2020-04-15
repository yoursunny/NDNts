import { KeyChainImplWebCrypto as crypto } from "@ndn/keychain";

const ECDH_PARAMS: EcKeyGenParams & EcKeyImportParams = {
  name: "ECDH",
  namedCurve: "P-256",
};

export async function generateEcdhKey(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ECDH_PARAMS, false, ["deriveBits"]);
}

export async function importEcdhPub(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, ECDH_PARAMS, true, []);
}

export async function exportEcdhPub(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(raw);
}

const SALT_LEN = 32;

export function makeSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LEN));
}

export function checkSalt(input: Uint8Array) {
  if (input.byteLength !== SALT_LEN) {
    throw new Error("bad Salt");
  }
}

const REQUEST_ID_LEN = 8;

export function makeRequestId(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(REQUEST_ID_LEN));
}

export function checkRequestId(input: Uint8Array) {
  if (input.byteLength !== REQUEST_ID_LEN) {
    throw new Error("bad RequestId");
  }
}

export async function makeSessionKey(
    ecdhPvt: CryptoKey,
    ecdhPub: CryptoKey,
    salt: Uint8Array,
    requestId: Uint8Array,
): Promise<CryptoKey> {
  const hkdfBits = await crypto.subtle.deriveBits({ name: "ECDH", public: ecdhPub }, ecdhPvt, 256);
  const hkdfKey = await crypto.subtle.importKey("raw", hkdfBits, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      salt,
      info: requestId,
      hash: "SHA-256",
    } as any,
    hkdfKey,
    {
      name: "AES-GCM",
      length: 128,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface Encrypted {
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

export async function sessionEncrypt(key: CryptoKey, plaintext: Uint8Array): Promise<Encrypted> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

export async function sessionDecrypt(key: CryptoKey, { iv, ciphertext }: Encrypted): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new Uint8Array(plaintext);
}
