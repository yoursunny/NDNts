import { KeyLocator, LLSign, LLVerify, Name, NameLike, Signer, Verifier } from "@ndn/packet";
import assert from "minimalistic-assert";

import { ECDSA } from "../algo/mod";
import { SigningAlgorithmListSlim } from "../algolist/mod";
import type { Certificate } from "../cert/mod";
import * as CertNaming from "../naming";
import type { KeyChain } from "../store/mod";
import { generateKeyInternal } from "./generate";
import { CryptoAlgorithm, KeyKind, type NamedSigner, type NamedVerifier, type SigningAlgorithm } from "./types";

class PlainCryptoSigner<I> implements Signer {
  constructor(
      algo: SigningAlgorithm<I>,
      key: CryptoAlgorithm.PrivateSecretKey<I>,
  ) {
    const pvtkey = key as CryptoAlgorithm.PrivateKey<I>;
    if (pvtkey.privateKey) {
      this[KeyKind] = "private";
      this.llSign = (algo as SigningAlgorithm<I, true>).makeLLSign(pvtkey);
    } else {
      this[KeyKind] = "secret";
      this.llSign = (algo as SigningAlgorithm<I, false>).makeLLSign(key as CryptoAlgorithm.SecretKey<I>);
    }
    this.sigType = algo.sigType;
  }

  public readonly [KeyKind]: "private" | "secret";
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

  public override sign(pkt: Signer.Signable) {
    return this.signWithKeyLocator(pkt, this.name);
  }

  public withKeyLocator(keyLocator: KeyLocator.CtorArg) {
    return {
      sign: (pkt: Signer.Signable) => this.signWithKeyLocator(pkt, keyLocator),
    };
  }
}

class PlainCryptoVerifier<I> implements Verifier {
  constructor(
      algo: SigningAlgorithm<I>,
      key: CryptoAlgorithm.PublicSecretKey<I>,
  ) {
    const pubkey = key as CryptoAlgorithm.PublicKey<I>;
    if (pubkey.publicKey) {
      this[KeyKind] = "public";
      this.llVerify = (algo as SigningAlgorithm<I, true>).makeLLVerify(pubkey);
      this.spki = pubkey.spki;
    } else {
      this[KeyKind] = "secret";
      this.llVerify = (algo as SigningAlgorithm<I, false>).makeLLVerify(key as CryptoAlgorithm.SecretKey<I>);
    }
    this.sigType = algo.sigType;
  }

  public readonly [KeyKind]: "public" | "secret";
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

  public override verify(pkt: Verifier.Verifiable): Promise<void> {
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

/**
 * Create a named verifier from certificate public key.
 * @param algoList list of recognized algorithms. Default is SigningAlgorithmListSlim.
 *                 Use SigningAlgorithmListFull for all algorithms, at the cost of larger bundle size.
 */
export function createVerifier(cert: Certificate, algoList?: readonly SigningAlgorithm[]): Promise<NamedVerifier.PublicKey>;

export function createVerifier(arg1: any, arg2: any = SigningAlgorithmListSlim, arg3?: any): any {
  if (arg3) {
    return new NamedCryptoVerifier(arg1, arg2, arg3);
  }
  if (Array.isArray(arg2)) {
    return (async (cert: Certificate, algoList: readonly SigningAlgorithm[]) => {
      let verifier = certVerifiers.get(cert);
      if (!verifier) {
        const [algo, key] = await cert.importPublicKey(algoList);
        verifier = new NamedCryptoVerifier(CertNaming.toKeyName(cert.name), algo, key);
      }
      return verifier;
    })(arg1, arg2);
  }
  return new PlainCryptoVerifier(arg1, arg2);
}

const certVerifiers = new WeakMap<Certificate, NamedVerifier>();

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
  const [keyName, algo, gen] = await generateKeyInternal<SigningAlgorithm>(ECDSA, a);
  assert(CryptoAlgorithm.isSigning(algo));
  return [
    createSigner(keyName, algo, gen),
    createVerifier(keyName, algo, gen),
  ];
}
