import { SigType } from "@ndn/l3pkt";
import { Name, NameLike } from "@ndn/name";
import assert from "minimalistic-assert";

import { KeyChain } from "../..";
import { crypto } from "../../platform";
import { generateKey, StoredKey } from "../internal";
import { PrivateKeyBase } from "../private-key";
import { RsaModulusLength, RsaPublicKey } from ".";
import { ALGO, GEN_PARAMS, IMPORT_PARAMS } from "./internal";

/** RSA private key. */
export class RsaPrivateKey extends PrivateKeyBase {
  constructor(name: Name, private readonly key: CryptoKey) {
    super(name, SigType.Sha256WithRsa, name);
  }

  protected async llSign(input: Uint8Array): Promise<Uint8Array> {
    const rawSig = await crypto.subtle.sign(ALGO, this.key, input);
    return new Uint8Array(rawSig);
  }
}

export namespace RsaPrivateKey {
  export async function generate(
      nameInput: NameLike, modulusLength: RsaModulusLength,
      keyChain?: KeyChain): Promise<[RsaPrivateKey, RsaPublicKey]> {
    const [name, pvt, pub] = await generateKey(nameInput, { type: "RSA" },
      { ...GEN_PARAMS, modulusLength } as RsaHashedKeyGenParams|RsaHashedImportParams, keyChain);
    return [
      new RsaPrivateKey(name, pvt),
      new RsaPublicKey(name, pub!),
    ];
  }

  export async function loadFromStored(name: Name, stored: StoredKey): Promise<[RsaPrivateKey, RsaPublicKey]> {
    assert.equal(stored.type, "RSA");
    let pvt: CryptoKey;
    let pub: CryptoKey;
    if (stored.isJwk) {
      [pvt, pub] = await Promise.all([
        crypto.subtle.importKey("jwk", stored.pvt as JsonWebKey,
          IMPORT_PARAMS, false, ["sign"]),
        crypto.subtle.importKey("jwk", stored.pub as JsonWebKey,
          IMPORT_PARAMS, true, ["verify"]),
      ]);
    } else {
      pvt = stored.pvt as CryptoKey;
      pub = stored.pub as CryptoKey;
    }
    return [
      new RsaPrivateKey(name, pvt),
      new RsaPublicKey(name, pub),
    ];
  }
}
