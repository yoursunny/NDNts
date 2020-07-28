import { Name, NameLike, SigType } from "@ndn/packet";
import { fromHex, toHex } from "@ndn/tlv";
import * as asn1 from "@yoursunny/asn1";
import assert from "minimalistic-assert";

import type { KeyChain } from "../../store/mod";
import { PrivateKey } from "../base";
import { crypto } from "../crypto_node";
import { generateKey, LoadedKey, StoredKey } from "../save";
import { CurveParams, EcCurve, makeGenParams, SIGN_PARAMS } from "./algo";
import { EcPublicKey } from "./public-key";

/** ECDSA private key. */
export class EcPrivateKey extends PrivateKey {
  constructor(name: Name, public readonly curve: EcCurve, private readonly key: CryptoKey) {
    super(name, SigType.Sha256WithEcdsa);
  }

  protected async llSign(input: Uint8Array): Promise<Uint8Array> {
    const raw = new Uint8Array(await crypto.subtle.sign(SIGN_PARAMS, this.key, input));
    const pointSize = CurveParams[this.curve].pointSize;
    return fromHex(asn1.Any("30",
      asn1.UInt(toUintHex(raw, 0, pointSize)),
      asn1.UInt(toUintHex(raw, pointSize, 2 * pointSize)),
    ));
  }
}

function toUintHex(array: Uint8Array, start: number, end: number): string {
  let msb: number;
  for (msb = start; msb < end; ++msb) {
    if (array[msb]) {
      break;
    }
  }
  return toHex(array.slice(msb, end));
}

interface StoredEcKey extends StoredKey {
  curve: EcCurve;
}

export namespace EcPrivateKey {
  export const makeWebCryptoImportParams = makeGenParams;
  export const STORED_TYPE = "EC";

  export function makeStoredKeyBase(curve: EcCurve) {
    return { type: STORED_TYPE, curve };
  }

  /**
   * Generate ECDSA key pair.
   * @param nameInput subject name or key name.
   * @param curve EC curve.
   * @param keyChain save the key pair to KeyChain, if supplied.
   */
  export async function generate(
    nameInput: NameLike, curve?: EcCurve,
    keyChain?: KeyChain): Promise<[EcPrivateKey, EcPublicKey]>;

  export async function generate(
    nameInput: NameLike, keyChain: KeyChain): Promise<[EcPrivateKey, EcPublicKey]>;

  export async function generate(
      nameInput: NameLike, arg2?: EcCurve|KeyChain,
      keyChain?: KeyChain): Promise<[EcPrivateKey, EcPublicKey]> {
    let curve = EcCurve.Default;
    switch (typeof arg2) {
      case "object":
        keyChain = arg2;
        break;
      case "string":
        curve = arg2;
        break;
    }

    const [name, pvt, pub] = await generateKey(nameInput, makeStoredKeyBase(curve),
      makeGenParams(curve), keyChain);
    return [
      new EcPrivateKey(name, curve, pvt),
      new EcPublicKey(name, curve, pub!),
    ];
  }

  export async function loadFromStored(name: Name, stored: StoredKey, extractable = false): Promise<LoadedKey> {
    assert.equal(stored.type, STORED_TYPE);
    const { curve, isJwk, pvt, pub } = stored as StoredEcKey;
    let cryptoPvt: CryptoKey;
    let cryptoPub: CryptoKey;
    if (isJwk) {
      const params = makeGenParams(curve);
      [cryptoPvt, cryptoPub] = await Promise.all([
        crypto.subtle.importKey("jwk", pvt as JsonWebKey, params, extractable, ["sign"]),
        crypto.subtle.importKey("jwk", pub as JsonWebKey, params, true, ["verify"]),
      ]);
    } else {
      cryptoPvt = pvt as CryptoKey;
      cryptoPub = pub as CryptoKey;
    }
    return {
      cryptoPvt,
      cryptoPub,
      privateKey: new EcPrivateKey(name, curve, cryptoPvt),
      publicKey: new EcPublicKey(name, curve, cryptoPub),
    };
  }
}
