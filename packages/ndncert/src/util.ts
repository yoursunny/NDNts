import { KeyChainImplWebCrypto as crypto, PrivateKey } from "@ndn/keychain";
import { signInterest02 } from "@ndn/nfdmgmt";
import { Interest } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";
import fastChunkString from "fast-chunk-string";

import { TT_ENCRYPTED_PAYLOAD, TT_INITIAL_VECTOR } from "./an";

/**
 * ndncert-specific base64 encoding.
 *
 * ndncert CA expects a base64 encoding to have a newline after every 64 bytes
 * and at the end.
 */
export function base64Encode(input: Uint8Array): string {
  const b64 = Buffer.from(input).toString("base64");
  const lines = fastChunkString(b64, { size: 64 });
  return lines.map((line) => `${line}\n`).join("");
}

export async function makeInterestParams(json: unknown, aesKey?: CryptoKey): Promise<Uint8Array> {
  const body = new TextEncoder().encode(JSON.stringify(json));
  if (!aesKey) {
    return body;
  }

  const encoder = new Encoder();
  const iv = encoder.prependRoom(16);
  crypto.getRandomValues(iv);
  encoder.prependTypeLength(TT_INITIAL_VECTOR, iv.length);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, aesKey, body);
  encoder.prependTlv(TT_ENCRYPTED_PAYLOAD, new Uint8Array(encrypted));
  return encoder.output;
}

export async function readDataPayload(payload: Uint8Array, aesKey?: CryptoKey): Promise<unknown> {
  let body = payload;
  if (aesKey) {
    const decoder = new Decoder(payload);
    const { type: tt0, value: encrypted } = decoder.read();
    const { type: tt1, value: iv } = decoder.read();
    if (tt0 !== TT_ENCRYPTED_PAYLOAD || tt1 !== TT_INITIAL_VECTOR) {
      throw new Error("bad encrypted payload");
    }
    body = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv }, aesKey, encrypted));
  }
  return JSON.parse(new TextDecoder().decode(body));
}

/**
 * ndncert-specific Interest signing.
 *
 * ndncert CA expects 2014 Signed Interest format together with ParamsDigest.
 */
export async function signInterest(interest: Interest, signer: PrivateKey): Promise<Interest> {
  await interest.updateParamsDigest();
  return signInterest02(interest, { signer });
}

export function compressEcPublicKey(raw: Uint8Array): Uint8Array {
  // https://gist.github.com/shanewholloway/6ed5a52fa985b1d23024daa001b6a51e
  const compressed = raw.slice(0, (raw.byteLength + 1) / 2);
  compressed[0] = 0x02 + raw[raw.byteLength - 1] % 2;
  return compressed;
}

/**
 * ndncert-specific salt string decoder.
 *
 * ndncert CA creates HKDF 'salt' as uint64 and encodes it as ASCII number.
 * Endianness depends on server hardware, but here we assume little endian.
 */
export function saltFromString(input: string): Uint8Array {
  const a = new Uint8Array(8);
  new DataView(a.buffer).setBigUint64(0, BigInt(input), true);
  return a;
}

export const HKDF_INFO = Uint8Array.of(0xF0, 0xF1, 0xF2, 0xF3, 0xF4, 0xF5, 0xF6, 0xF7, 0xF8, 0xF9);
