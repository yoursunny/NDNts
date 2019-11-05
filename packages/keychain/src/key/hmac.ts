import { SigInfo, SigType } from "@ndn/l3pkt";
import { Name, NameLike } from "@ndn/name";
import applyMixins from "applymixins";
import assert from "minimalistic-assert";

import { KeyChain } from "..";
import { crypto } from "../platform";
import { PrivateKeyBase } from "./private-key";
import { PublicKeyBase } from "./public-key";
import { generateKey, saveKey, StoredKey } from "./save";

export class HmacKey extends PublicKeyBase {
  constructor(name: Name, private readonly key: CryptoKey) {
    super(name, SigType.HmacWithSha256, undefined);
  }

  public exportAsSpki(): Promise<Uint8Array> {
    return Promise.reject(new Error("cannot export DigestKey"));
  }

  protected async llSign(input: Uint8Array): Promise<Uint8Array> {
    const h = await crypto.subtle.sign("HMAC", this.key, input);
    return new Uint8Array(h);
  }

  protected doMatch(si: SigInfo): boolean {
    return typeof si.keyLocator === "undefined";
  }

  protected async llVerify(input: Uint8Array, sig: Uint8Array): Promise<void> {
    const ok = await crypto.subtle.verify("HMAC", this.key, sig, input);
    PublicKeyBase.throwOnIncorrectSig(ok);
  }
}
export interface HmacKey extends PrivateKeyBase {}
applyMixins(HmacKey, [PrivateKeyBase]);

const GEN_PARAMS: HmacKeyGenParams&HmacImportParams = {
  name: "HMAC",
  hash: "SHA-256",
};

export namespace HmacKey {
  export const STORED_TYPE = "HMAC";

  export function makeStoredKeyBase() {
    return { type: STORED_TYPE };
  }

  export async function importRaw(nameInput: NameLike, raw: Uint8Array, keyChain?: KeyChain): Promise<HmacKey> {
    const [name, pvt] = await saveKey(nameInput, makeStoredKeyBase(), GEN_PARAMS, keyChain,
      (extractable) => crypto.subtle.importKey("raw", raw, GEN_PARAMS, extractable, ["sign", "verify"]));
    return new HmacKey(name, pvt);
  }

  export async function generate(nameInput: NameLike, keyChain?: KeyChain): Promise<HmacKey> {
    const [name, pvt] = await generateKey(nameInput, makeStoredKeyBase(), GEN_PARAMS, keyChain);
    return new HmacKey(name, pvt);
  }

  export async function loadFromStored(name: Name, stored: StoredKey): Promise<[HmacKey, HmacKey]> {
    assert.equal(stored.type, STORED_TYPE);
    let pvt: CryptoKey;
    if (stored.isJwk) {
      pvt = await crypto.subtle.importKey("jwk", stored.pvt as JsonWebKey, GEN_PARAMS, false, ["sign"]);
    } else {
      pvt = stored.pvt as CryptoKey;
    }
    const key = new HmacKey(name, pvt);
    return [key, key];
  }
}
