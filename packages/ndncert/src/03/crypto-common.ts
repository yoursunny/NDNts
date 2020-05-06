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
  c: Uint8Array;
  t: Uint8Array;
}

export async function sessionEncrypt(requestId: Uint8Array, key: CryptoKey, plaintext: Uint8Array): Promise<Encrypted> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const algo: AesGcmParams = {
    name: "AES-GCM",
    iv,
    additionalData: requestId,
    tagLength: 128,
  };
  const ct = await crypto.subtle.encrypt(algo, key, plaintext);
  const cLen = ct.byteLength - algo.tagLength! / 8;
  return {
    iv,
    c: new Uint8Array(ct, 0, cLen),
    t: new Uint8Array(ct, cLen),
  };
}

export async function sessionDecrypt(requestId: Uint8Array, key: CryptoKey, { iv, c, t }: Encrypted): Promise<Uint8Array> {
  const algo: AesGcmParams = {
    name: "AES-GCM",
    iv,
    additionalData: requestId,
    tagLength: 128,
  };
  if (t.byteLength !== algo.tagLength! / 8) {
    throw new Error("bad AuthenticationTag");
  }
  const ct = new Uint8Array(c.byteLength + t.byteLength);
  ct.set(c, 0);
  ct.set(t, c.byteLength);
  const plaintext = await crypto.subtle.decrypt(algo, key, ct);
  return new Uint8Array(plaintext);
}
