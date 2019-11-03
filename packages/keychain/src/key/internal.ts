import { KeyLocator, SigInfo } from "@ndn/l3pkt";
import { Name, NameLike } from "@ndn/name";

import { KeyName } from "../name";
import { crypto } from "../platform";
import { KeyChain } from "../store";

export interface PacketWithSignature {
  sigInfo?: SigInfo;
  sigValue?: Uint8Array;
}

export abstract class NamedKey {
  constructor(public readonly name: Name, public readonly sigType: number,
              public readonly keyLocator: KeyLocator|undefined) {
    KeyName.from(name);
  }
}

export interface StoredKey {
  type: string;
  isJwk: boolean;
  pvt: CryptoKey|JsonWebKey;
  pub?: CryptoKey|JsonWebKey;
}

export async function generateKey<T extends { type: string }>(
    nameInput: NameLike, type: T, algo: any,
    keyChain: KeyChain|undefined): Promise<[Name, CryptoKey, CryptoKey|undefined]> {
  const name = KeyName.create(nameInput).toName();

  const needJwk = keyChain?.canSCloneKeys === false;
  const pvtOrPair = await crypto.subtle.generateKey(algo, needJwk, ["sign", "verify"]);
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
      }
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
