import { Decrypter, Encrypter, LLDecrypt, LLEncrypt, Name, NameLike } from "@ndn/packet";
import assert from "minimalistic-assert";

import * as CertNaming from "../naming";
import type { KeyChain } from "../store/mod";
import { generateKeyInternal } from "./generate";
import { CryptoAlgorithm, EncryptionAlgorithm, KeyKind, NamedDecrypter, NamedEncrypter } from "./types";

class PlainCryptoEncrypter<I> {
  constructor(
      algo: EncryptionAlgorithm<I>,
      key: CryptoAlgorithm.PublicSecretKey<I>,
  ) {
    const pubkey = key as CryptoAlgorithm.PublicKey<I>;
    this[KeyKind] = pubkey.publicKey ? "public" : "secret";
    this.llEncrypt = algo.makeLLEncrypt(key);
    this.spki = pubkey.spki;
  }

  public readonly [KeyKind]: "public"|"secret";
  public readonly llEncrypt: LLEncrypt;
  public readonly spki?: Uint8Array;
}

class NamedCryptoEncrypter<I> extends PlainCryptoEncrypter<I> implements NamedEncrypter {
  constructor(
      public readonly name: Name,
      algo: EncryptionAlgorithm<I>,
      key: CryptoAlgorithm.PublicSecretKey<I>,
  ) {
    super(algo, key);
    assert(CertNaming.isKeyName(name), `bad key name ${name}`);
  }
}

class PlainCryptoDecrypter<I> {
  constructor(
      algo: EncryptionAlgorithm<I>,
      key: CryptoAlgorithm.PrivateSecretKey<I>,
  ) {
    const pvtkey = key as CryptoAlgorithm.PrivateKey<I>;
    this[KeyKind] = pvtkey.privateKey ? "private" : "secret";
    this.llDecrypt = algo.makeLLDecrypt(key);
  }

  public readonly [KeyKind]: "private"|"secret";
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

/** Create a plain encrypter from crypto key. */
export function createEncrypter<I>(algo: EncryptionAlgorithm<I>, key: CryptoAlgorithm.PublicSecretKey<I>): Encrypter;

/** Create a named encrypter from crypto key. */
export function createEncrypter<I, Asym extends boolean>(name: Name, algo: EncryptionAlgorithm<I, Asym>, key: CryptoAlgorithm.PublicSecretKey<I>): NamedEncrypter<Asym>;

export function createEncrypter(arg1: any, arg2: any, arg3?: any): any {
  if (arg3) {
    return new NamedCryptoEncrypter(arg1, arg2, arg3);
  }
  return new PlainCryptoEncrypter(arg1, arg2);
}

/** Create a plain decrypter from crypto key. */
export function createDecrypter<I>(algo: EncryptionAlgorithm<I>, key: CryptoAlgorithm.PrivateSecretKey<I>): Decrypter;

/** Create a named decrypter from crypto key. */
export function createDecrypter<I, Asym extends boolean>(name: Name, algo: EncryptionAlgorithm<I, Asym>, key: CryptoAlgorithm.PrivateSecretKey<I>): NamedDecrypter<Asym>;

export function createDecrypter(arg1: any, arg2: any, arg3?: any): any {
  if (arg3) {
    return new NamedCryptoDecrypter(arg1, arg2, arg3);
  }
  return new PlainCryptoDecrypter(arg1, arg2);
}

type EncryptionOptG<I, Asym extends boolean, G> =
  {} extends G ? [EncryptionAlgorithm<I, Asym, G>, G?] : [EncryptionAlgorithm<I, Asym, G>, G];

/** Generate a pair of encrypter and decrypter. */
export async function generateEncryptionKey<I, Asym extends boolean, G>(
  name: NameLike,
  ...a: EncryptionOptG<I, Asym, G>
): Promise<[NamedEncrypter<Asym>, NamedDecrypter<Asym>]>;

/** Generate a pair of encrypter and decrypter, and save to KeyChain. */
export async function generateEncryptionKey<I, Asym extends boolean, G>(
  keyChain: KeyChain,
  name: NameLike,
  ...a: EncryptionOptG<I, Asym, G>
): Promise<[NamedEncrypter<Asym>, NamedDecrypter<Asym>]>;

export async function generateEncryptionKey(...a: unknown[]) {
  const [keyName, algo, gen] = await generateKeyInternal<EncryptionAlgorithm>(undefined as any, a);
  assert(CryptoAlgorithm.isEncryption(algo));
  return [
    createEncrypter(keyName, algo, gen),
    createDecrypter(keyName, algo, gen),
  ];
}
