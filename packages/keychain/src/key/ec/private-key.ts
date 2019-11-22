import { Name, NameLike, SigType } from "@ndn/packet";
import assert from "minimalistic-assert";

import { EcCurve, EcPublicKey, KeyChain } from "../../mod";
import { crypto } from "../platform/mod";
import { PrivateKeyBase } from "../private-key";
import { generateKey, StoredKey } from "../save";
import { makeGenParams, SIGN_PARAMS, sigRawToDer } from "./internal";

/** ECDSA private key. */
export class EcPrivateKey extends PrivateKeyBase {
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

  export async function loadFromStored(name: Name, stored: StoredKey): Promise<[EcPrivateKey, EcPublicKey]> {
    assert.equal(stored.type, STORED_TYPE);
    const { curve } = stored as StoredEcKey;
    let pvt: CryptoKey;
    let pub: CryptoKey;
    if (stored.isJwk) {
      const params = makeGenParams(curve);
      [pvt, pub] = await Promise.all([
        crypto.subtle.importKey("jwk", stored.pvt as JsonWebKey, params, false, ["sign"]),
        crypto.subtle.importKey("jwk", stored.pub as JsonWebKey, params, true, ["verify"]),
      ]);
    } else {
      pvt = stored.pvt as CryptoKey;
      pub = stored.pub as CryptoKey;
    }
    return [
      new EcPrivateKey(name, curve, pvt),
      new EcPublicKey(name, curve, pub),
    ];
  }
}
