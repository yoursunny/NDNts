import { Name, NameLike } from "@ndn/name";

import { KeyChain, KeyName } from "..";
import { crypto } from "./platform";

export interface StoredKey {
  type: string;
  isJwk: boolean;
  pvt: CryptoKey|JsonWebKey;
  pub?: CryptoKey|JsonWebKey;
}

export async function saveKey<T extends { type: string }>(
    nameInput: NameLike, type: T, algo: any, keyChain: KeyChain|undefined,
    makeKeys: (extractable: boolean, crypto: Crypto) => PromiseLike<CryptoKey|CryptoKeyPair>,
): Promise<[Name, CryptoKey, CryptoKey|undefined]> {
  const name = KeyName.create(nameInput).toName();

  const needJwk = keyChain?.canSCloneKeys === false;
  const pvtOrPair = await makeKeys(needJwk, crypto);
  let pvt: CryptoKey;
  let pub: CryptoKey|undefined;
  if ((pvtOrPair as CryptoKeyPair).privateKey) {
    ({ privateKey: pvt, publicKey: pub } = pvtOrPair as CryptoKeyPair);
  } else {
    pvt = pvtOrPair as CryptoKey;
    pub = undefined;
  }

  if (keyChain) {
    let stored: StoredKey;
    if (needJwk) {
      stored = {
        ...type,
        isJwk: true,
        pvt: await crypto.subtle.exportKey("jwk", pvt),
        pub: pub ? await crypto.subtle.exportKey("jwk", pub) : undefined,
      };
      pvt = await crypto.subtle.importKey("jwk", stored.pvt as JsonWebKey, algo, false, ["sign"]);
    } else {
      stored = {
        ...type,
        isJwk: false,
        pvt,
        pub,
      };
    }
    keyChain.insertKey(name, stored);
  }

  return [name, pvt, pub];
}

export function generateKey<T extends { type: string }>(
    nameInput: NameLike, type: T, algo: any, keyChain: KeyChain|undefined
): Promise<[Name, CryptoKey, CryptoKey|undefined]> {
  return saveKey(
    nameInput, type, algo, keyChain,
    (extractable) => crypto.subtle.generateKey(algo, extractable, ["sign", "verify"])
  );
}
