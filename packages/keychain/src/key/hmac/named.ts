import { Name, NameLike, Signer, Verifier } from "@ndn/packet";
import assert from "minimalistic-assert";

import { KeyChain } from "../../store/mod";
import { PrivateKey, PublicKey } from "../base";
import { crypto } from "../crypto_node";
import { generateKey, LoadedKey, saveKey, StoredKey } from "../save";
import { PlainHmacKey } from "./plain";

export class HmacKey extends PlainHmacKey {
  constructor(public readonly name: Name, key: CryptoKey) {
    super(key);
  }

  public sign(pkt: Signer.Signable): Promise<void> {
    Signer.putSigInfo(pkt, undefined, this.name);
    return super.sign(pkt);
  }

  public async verify(pkt: Verifier.Verifiable): Promise<void> {
    PublicKey.checkKeyLocator(pkt.sigInfo, this.name);
    return super.verify(pkt);
  }
}
export interface HmacKey extends PrivateKey, PublicKey {}

export namespace HmacKey {
  export const STORED_TYPE = "HMAC";

  export function makeStoredKeyBase() {
    return { type: STORED_TYPE };
  }

  export async function importRaw(nameInput: NameLike, raw: Uint8Array, keyChain?: KeyChain): Promise<HmacKey> {
    const [name, pvt] = await saveKey(nameInput, makeStoredKeyBase(), HmacKey.GEN_PARAMS, keyChain,
      (extractable) => crypto.subtle.importKey("raw", raw, HmacKey.GEN_PARAMS, extractable, ["sign", "verify"]));
    return new HmacKey(name, pvt);
  }

  export async function generate(nameInput: NameLike, keyChain?: KeyChain): Promise<HmacKey> {
    const [name, pvt] = await generateKey(nameInput, makeStoredKeyBase(), HmacKey.GEN_PARAMS, keyChain);
    return new HmacKey(name, pvt);
  }

  export async function loadFromStored(name: Name, { type, isJwk, pvt }: StoredKey, extractable = false): Promise<LoadedKey> {
    assert.equal(type, STORED_TYPE);
    let cryptoPvt: CryptoKey;
    if (isJwk) {
      cryptoPvt = await crypto.subtle.importKey("jwk", pvt as JsonWebKey, HmacKey.GEN_PARAMS, extractable, ["sign", "verify"]);
    } else {
      cryptoPvt = pvt as CryptoKey;
    }
    const key = new HmacKey(name, cryptoPvt);
    return {
      cryptoPvt,
      privateKey: key,
      publicKey: key,
    };
  }
}
