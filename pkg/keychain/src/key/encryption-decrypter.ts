import type { LLDecrypt, Name } from "@ndn/packet";
import { assert } from "@ndn/util";

import * as CertNaming from "../naming";
import { type CryptoAlgorithm, type EncryptionAlgorithm, KeyKind, type NamedDecrypter } from "./types";

class PlainCryptoDecrypter<I> {
  constructor(
      algo: EncryptionAlgorithm<I>,
      key: CryptoAlgorithm.PrivateSecretKey<I>,
  ) {
    if ("privateKey" in key) {
      this[KeyKind] = "private";
      this.llDecrypt = (algo as EncryptionAlgorithm<I, true>).makeLLDecrypt(key);
    } else {
      this[KeyKind] = "secret";
      this.llDecrypt = (algo as EncryptionAlgorithm<I, false>).makeLLDecrypt(key);
    }
  }

  public readonly [KeyKind]: "private" | "secret";
  public readonly llDecrypt: LLDecrypt;
}

class NamedCryptoDecrypter<I> extends PlainCryptoDecrypter<I> implements NamedDecrypter {
  constructor(
      public readonly name: Name,
      algo: EncryptionAlgorithm<I>,
      key: CryptoAlgorithm.PrivateSecretKey<I>,
  ) {
    super(algo, key);
    assert(CertNaming.isKeyName(name), `bad key name ${name}`);
  }
}

/**
 * Create a plain decrypter from crypto key.
 * @param algo - Encryption algorithm.
 * @param key - Private key or secret key, which must match `algo`.
 */
export function createDecrypter<I>(algo: EncryptionAlgorithm<I>, key: CryptoAlgorithm.PrivateSecretKey<I>): LLDecrypt.Key;

/**
 * Create a named decrypter from crypto key.
 * @param name - Key name.
 * @param algo - Encryption algorithm.
 * @param key - Private key or secret key, which must match `algo`.
 */
export function createDecrypter<I, Asym extends boolean>(name: Name, algo: EncryptionAlgorithm<I, Asym>, key: CryptoAlgorithm.PrivateSecretKey<I>): NamedDecrypter<Asym>;

export function createDecrypter(arg1: any, arg2: any, arg3?: any): any {
  if (arg3) {
    return new NamedCryptoDecrypter(arg1, arg2, arg3);
  }
  return new PlainCryptoDecrypter(arg1, arg2);
}
