import { SigType } from "@ndn/l3pkt";
import { Name, NameLike } from "@ndn/name";
import assert from "minimalistic-assert";

import { KeyChain, RsaModulusLength, RsaPublicKey } from "../..";
import { crypto } from "../../platform";
import { PrivateKeyBase } from "../private-key";
import { generateKey, StoredKey } from "../save";
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
  export function makeWebCryptoImportParams() {
    return IMPORT_PARAMS;
  }

  export const STORED_TYPE = "RSA";

  export function makeStoredKeyBase() {
    return { type: STORED_TYPE };
  }

  export async function generate(
      nameInput: NameLike, modulusLength: RsaModulusLength,
      keyChain?: KeyChain): Promise<[RsaPrivateKey, RsaPublicKey]> {
    const [name, pvt, pub] = await generateKey(nameInput, makeStoredKeyBase(),
      { ...GEN_PARAMS, modulusLength } as RsaHashedKeyGenParams|RsaHashedImportParams, keyChain);
    return [
      new RsaPrivateKey(name, pvt),
      new RsaPublicKey(name, pub!),
    ];
  }

  export async function loadFromStored(name: Name, stored: StoredKey): Promise<[RsaPrivateKey, RsaPublicKey]> {
    assert.equal(stored.type, STORED_TYPE);
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
