import { SigType } from "@ndn/l3pkt";
import { Name, NameLike } from "@ndn/name";
import assert from "minimalistic-assert";

import { KeyChain } from "../..";
import { crypto } from "../../platform";
import { generateKey, StoredKey } from "../internal";
import { PrivateKeyBase } from "../private-key";
import { EcCurve, EcPublicKey } from ".";
import { SIGN_PARAMS, sigRawToDer } from "./internal";

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
  export async function generate(
      nameInput: NameLike, curve: EcCurve,
      keyChain?: KeyChain): Promise<[EcPrivateKey, EcPublicKey]> {
    const [name, pvt, pub] = await generateKey(nameInput, { type: "EC", curve },
      { name: "ECDSA", namedCurve: curve } as EcKeyGenParams|EcKeyImportParams, keyChain);
    return [
      new EcPrivateKey(name, curve, pvt),
      new EcPublicKey(name, curve, pub!),
    ];
  }

  export async function loadFromStored(name: Name, stored: StoredKey): Promise<[EcPrivateKey, EcPublicKey]> {
    assert.equal(stored.type, "EC");
    const { curve } = stored as StoredEcKey;
    let pvt: CryptoKey;
    let pub: CryptoKey;
    if (stored.isJwk) {
      [pvt, pub] = await Promise.all([
        crypto.subtle.importKey("jwk", stored.pvt as JsonWebKey,
          { name: "ECDSA", namedCurve: curve }, false, ["sign"]),
        crypto.subtle.importKey("jwk", stored.pub as JsonWebKey,
          { name: "ECDSA", namedCurve: curve }, true, ["verify"]),
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
