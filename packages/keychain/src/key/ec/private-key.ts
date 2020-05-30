import { Name, NameLike, SigType } from "@ndn/packet";
import assert from "minimalistic-assert";

import { EcCurve, EcPublicKey, KeyChain } from "../../mod";
import { PrivateKey } from "../base";
import { crypto } from "../platform/mod";
import { generateKey, LoadedKey, StoredKey } from "../save";
import { makeGenParams, SIGN_PARAMS, sigRawToDer } from "./internal";

/** ECDSA private key. */
export class EcPrivateKey extends PrivateKey {
  constructor(name: Name, public readonly curve: EcCurve, private readonly key: CryptoKey) {
    super(name, SigType.Sha256WithEcdsa, name);
  }

  protected async llSign(input: Uint8Array): Promise<Uint8Array> {
    const rawSig = await crypto.subtle.sign(SIGN_PARAMS, this.key, input);
    return sigRawToDer(new Uint8Array(rawSig), this.curve);
  }
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

  export async function generate(
      nameInput: NameLike, curve: EcCurve,
      keyChain?: KeyChain): Promise<[EcPrivateKey, EcPublicKey]> {
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
