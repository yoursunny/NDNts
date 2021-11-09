import { AesBlockSize, AESGCM, CounterIvChecker, createDecrypter, createEncrypter, KeyChainImplWebCrypto as crypto } from "@ndn/keychain";
import { LLDecrypt, LLEncrypt, SignedInterestPolicy } from "@ndn/packet";

const ECDH_PARAMS: EcKeyGenParams & EcKeyImportParams = {
  name: "ECDH",
  namedCurve: "P-256",
};

export async function generateEcdhKey(): Promise<[pvt: CryptoKey, pub: CryptoKey]> {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(ECDH_PARAMS, false, ["deriveBits"]);
  return [privateKey, publicKey];
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

export interface SessionKey {
  sessionEncrypter: LLEncrypt.Key;
  sessionLocalDecrypter: LLDecrypt.Key;
  sessionDecrypter: LLDecrypt.Key;
}

export async function makeSessionKey(
    ecdhPvt: CryptoKey,
    ecdhPub: CryptoKey,
    salt: Uint8Array,
    requestId: Uint8Array,
): Promise<SessionKey> {
  const hkdfBits = await crypto.subtle.deriveBits({ name: "ECDH", public: ecdhPub }, ecdhPvt, 256);
  const hkdfKey = await crypto.subtle.importKey("raw", hkdfBits, "HKDF", false, ["deriveKey"]);
  const secretKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      salt,
      info: requestId,
      hash: "SHA-256",
    },
    hkdfKey,
    AESGCM.makeAesKeyGenParams({ length: 128 }),
    false,
    AESGCM.keyUsages.secret,
  );

  const key = { secretKey, info: {} };
  const ivChk = new CounterIvChecker({
    ivLength: AESGCM.ivLength,
    counterBits: 32,
    blockSize: AesBlockSize,
    requireSameRandom: true,
  });
  const sessionEncrypter = createEncrypter(AESGCM, key);
  const sessionLocalDecrypter = createDecrypter(AESGCM, key);
  const sessionDecrypter = ivChk.wrap(sessionLocalDecrypter);
  return {
    sessionEncrypter,
    sessionLocalDecrypter,
    sessionDecrypter,
  };
}

export function makeSignedInterestPolicy() {
  return new SignedInterestPolicy(SignedInterestPolicy.Nonce(), SignedInterestPolicy.Time());
}
