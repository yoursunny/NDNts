import { Name, NameLike, SigType } from "@ndn/packet";
import assert from "minimalistic-assert";

import { KeyChain, RsaModulusLength, RsaPublicKey } from "../../mod";
import { PrivateKey } from "../base";
import { crypto } from "../platform/mod";
import { generateKey, LoadedKey, StoredKey } from "../save";
import { ALGO, GEN_PARAMS, IMPORT_PARAMS } from "./internal";

/** RSA private key. */
export class RsaPrivateKey extends PrivateKey {
  constructor(name: Name, private readonly key: CryptoKey) {
    super(name, SigType.Sha256WithRsa);
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

  export async function loadFromStored(name: Name, { type, isJwk, pvt, pub }: StoredKey, extractable = false): Promise<LoadedKey> {
    assert.equal(type, STORED_TYPE);
    let cryptoPvt: CryptoKey;
    let cryptoPub: CryptoKey;
    if (isJwk) {
      [cryptoPvt, cryptoPub] = await Promise.all([
        crypto.subtle.importKey("jwk", pvt as JsonWebKey,
          IMPORT_PARAMS, false, ["sign"]),
        crypto.subtle.importKey("jwk", pub as JsonWebKey,
          IMPORT_PARAMS, true, ["verify"]),
      ]);
    } else {
      cryptoPvt = pvt as CryptoKey;
      cryptoPub = pub as CryptoKey;
    }
    return {
      cryptoPvt,
      cryptoPub,
      privateKey: new RsaPrivateKey(name, cryptoPvt),
      publicKey: new RsaPublicKey(name, cryptoPub),
    };
  }
}
