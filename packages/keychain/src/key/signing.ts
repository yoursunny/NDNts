import { KeyLocator, LLSign, LLVerify, Name, NameLike, Signer, Verifier } from "@ndn/packet";
import assert from "minimalistic-assert";

import * as CertNaming from "../naming";
import type { KeyChain, KeyStore } from "../store/mod";
import { ECDSA } from "./algo/mod";
import { crypto } from "./crypto_node";
import { CryptoAlgorithm, KeyKind, NamedSigner, NamedVerifier, SigningAlgorithm } from "./types";

class PlainCryptoSigner<I> implements Signer {
  constructor(
      algo: SigningAlgorithm<I>,
      key: CryptoAlgorithm.PrivateSecretKey<I>,
  ) {
    const pvtkey = key as CryptoAlgorithm.PrivateKey<I>;
    this[KeyKind] = pvtkey.privateKey ? "private" : "secret";
    this.sigType = algo.sigType;
    this.llSign = algo.makeLLSign(key);
  }

  public readonly [KeyKind]: "private"|"secret";
  public readonly sigType: number;
  private readonly llSign: LLSign;

  public sign(pkt: Signer.Signable) {
    return this.signWithKeyLocator(pkt, undefined);
  }

  protected signWithKeyLocator(pkt: Signer.Signable, keyLocator?: KeyLocator.CtorArg) {
    Signer.putSigInfo(pkt, this.sigType, keyLocator);
    return pkt[LLSign.OP]((input) => this.llSign(input));
  }
}

class NamedCryptoSigner<I> extends PlainCryptoSigner<I> implements NamedSigner {
  constructor(
      public readonly name: Name,
      algo: SigningAlgorithm<I>,
      key: CryptoAlgorithm.PrivateSecretKey<I>,
  ) {
    super(algo, key);
    assert(CertNaming.isKeyName(name), `bad key name ${name}`);
  }

  public sign(pkt: Signer.Signable) {
    return this.signWithKeyLocator(pkt, this.name);
  }

  public withKeyLocator(keyLocator: KeyLocator.CtorArg) {
    return {
      sign: (pkt: Signer.Signable) => {
        return this.signWithKeyLocator(pkt, keyLocator);
      },
    };
  }
}

class PlainCryptoVerifier<I> implements Verifier {
  constructor(
      algo: SigningAlgorithm<I>,
      key: CryptoAlgorithm.PublicSecretKey<I>,
  ) {
    const pubkey = key as CryptoAlgorithm.PublicKey<I>;
    this[KeyKind] = pubkey.publicKey ? "public" : "secret";
    this.sigType = algo.sigType;
    this.llVerify = algo.makeLLVerify(key as any);
    this.spki = pubkey.spki;
  }

  public readonly [KeyKind]: "public"|"secret";
  public readonly sigType: number;
  private readonly llVerify: LLVerify;
  public readonly spki?: Uint8Array;

  public verify(pkt: Verifier.Verifiable): Promise<void> {
    Verifier.checkSigType(pkt, this.sigType);
    return pkt[LLVerify.OP]((input, sig) => this.llVerify(input, sig));
  }
}

class NamedCryptoVerifier<I> extends PlainCryptoVerifier<I> implements NamedVerifier {
  constructor(
      public readonly name: Name,
      algo: SigningAlgorithm<I>,
      key: CryptoAlgorithm.PublicSecretKey<I>,
  ) {
    super(algo, key);
    assert(CertNaming.isKeyName(name), `bad key name ${name}`);
  }

  public verify(pkt: Verifier.Verifiable): Promise<void> {
    const klName = KeyLocator.mustGetName(pkt.sigInfo?.keyLocator);
    if (!this.name.isPrefixOf(klName)) {
      throw new Error(`KeyLocator ${klName} does not match key ${this.name}`);
    }
    return super.verify(pkt);
  }
}

/** Create a plain signer from crypto key. */
export function createSigner<I>(algo: SigningAlgorithm<I>, key: CryptoAlgorithm.PrivateSecretKey<I>): Signer;

/** Create a named signer from crypto key. */
export function createSigner<I, Asym extends boolean>(name: Name, algo: SigningAlgorithm<I, Asym>, key: CryptoAlgorithm.PrivateSecretKey<I>): NamedSigner<Asym>;

export function createSigner(arg1: any, arg2: any, arg3?: any): any {
  if (arg3) {
    return new NamedCryptoSigner(arg1, arg2, arg3);
  }
  return new PlainCryptoSigner(arg1, arg2);
}

/** Create a plain verifier from crypto key. */
export function createVerifier<I>(algo: SigningAlgorithm<I>, key: CryptoAlgorithm.PublicSecretKey<I>): Verifier;

/** Create a named verifier from crypto key. */
export function createVerifier<I, Asym extends boolean>(name: Name, algo: SigningAlgorithm<I, Asym>, key: CryptoAlgorithm.PublicSecretKey<I>): NamedVerifier<Asym>;

export function createVerifier(arg1: any, arg2: any, arg3?: any): any {
  if (arg3) {
    return new NamedCryptoVerifier(arg1, arg2, arg3);
  }
  return new PlainCryptoVerifier(arg1, arg2);
}

type SigningOptG<I, Asym extends boolean, G> =
  {} extends G ? [SigningAlgorithm<I, Asym, G>, G?] : [SigningAlgorithm<I, Asym, G>, G];

/** Generate a pair of signer and verifier with the default ECDSA signing algorithm. */
export async function generateSigningKey(
  name: NameLike,
): Promise<[NamedSigner.PrivateKey, NamedVerifier.PublicKey]>;

/** Generate a pair of signer and verifier with the default ECDSA signing algorithm, and save to KeyChain. */
export async function generateSigningKey(
  keyChain: KeyChain,
  name: NameLike,
): Promise<[NamedSigner.PrivateKey, NamedVerifier.PublicKey]>;

/** Generate a pair of signer and verifier. */
export async function generateSigningKey<I, Asym extends boolean, G>(
  name: NameLike,
  ...a: SigningOptG<I, Asym, G>
): Promise<[NamedSigner<Asym>, NamedVerifier<Asym>]>;

/** Generate a pair of signer and verifier, and save to KeyChain. */
export async function generateSigningKey<I, Asym extends boolean, G>(
  keyChain: KeyChain,
  name: NameLike,
  ...a: SigningOptG<I, Asym, G>
): Promise<[NamedSigner<Asym>, NamedVerifier<Asym>]>;

export async function generateSigningKey(...a: unknown[]) {
  let keyChain: KeyChain|undefined;
  if (typeof (a[0] as KeyChain).listKeys === "function") {
    keyChain = a.shift() as KeyChain;
  }
  const keyName = CertNaming.makeKeyName(new Name(a.shift() as NameLike));
  const algo = a.shift() as SigningAlgorithm<any> ?? ECDSA;
  const genParams = a.shift() ?? {};

  const useJwk = keyChain ? keyChain.needJwk : false;
  const gen = await algo.cryptoGenerate(genParams, useJwk);

  if (keyChain) {
    const stored: KeyStore.StoredKey = {
      algo: algo.uuid,
      info: gen.info,
    };
    if ((gen as CryptoAlgorithm.GeneratedKeyPair<unknown>).privateKey) {
      await saveAsymmetric(stored, useJwk, gen as CryptoAlgorithm.GeneratedKeyPair<unknown>);
    } else {
      await saveSymmetric(stored, useJwk, gen as CryptoAlgorithm.GeneratedSecretKey<unknown>);
    }
    await keyChain.insertKey(keyName, stored);
  }

  return [
    createSigner(keyName, algo, gen),
    createVerifier(keyName, algo, gen),
  ];
}

async function saveAsymmetric(
    stored: KeyStore.StoredKey,
    useJwk: boolean,
    gen: CryptoAlgorithm.GeneratedKeyPair<unknown>,
): Promise<void> {
  if (useJwk) {
    [stored.privateKey, stored.publicKey] = await Promise.all([
      crypto.subtle.exportKey("jwk", gen.privateKey),
      crypto.subtle.exportKey("jwk", gen.publicKey),
    ]);
    stored.jwkImportParams = gen.jwkImportParams;

    gen.privateKey = await crypto.subtle.importKey(
      "jwk", stored.privateKey, gen.jwkImportParams, false, ["sign"]);
  } else {
    stored.privateKey = gen.privateKey;
    stored.publicKey = gen.publicKey;
  }
  stored.publicKeySpki = gen.spki;
}

async function saveSymmetric(
    stored: KeyStore.StoredKey,
    useJwk: boolean,
    gen: CryptoAlgorithm.GeneratedSecretKey<unknown>,
): Promise<void> {
  if (useJwk) {
    stored.secretKey = await crypto.subtle.exportKey("jwk", gen.secretKey);
    stored.jwkImportParams = gen.jwkImportParams;

    gen.secretKey = await crypto.subtle.importKey(
      "jwk", stored.secretKey, gen.jwkImportParams, false, ["sign"]);
  } else {
    stored.secretKey = gen.secretKey;
  }
}
