import { KeyLocator, LLVerify, type Name, Verifier } from "@ndn/packet";
import { assert } from "@ndn/util";

import { SigningAlgorithmListSlim } from "../algolist/mod";
import type { Certificate } from "../cert/mod";
import * as CertNaming from "../naming";
import { ImportCertCached, type ImportCertOptions, isPublicSecretKey } from "./impl-import-cert";
import { type CryptoAlgorithm, KeyKind, type NamedVerifier, type SigningAlgorithm } from "./types";

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

/**
 * Create a plain verifier from crypto key.
 * @param algo - Signing algorithm.
 * @param key - Public key or secret key, which must match `algo`.
 */
export function createVerifier<I>(algo: SigningAlgorithm<I>, key: CryptoAlgorithm.PublicSecretKey<I>): Verifier;

/**
 * Create a named verifier from crypto key.
 * @param name - Key name.
 * @param algo - Signing algorithm.
 * @param key - Public key or secret key, which must match `algo`.
 */
export function createVerifier<I, Asym extends boolean>(name: Name, algo: SigningAlgorithm<I, Asym>, key: CryptoAlgorithm.PublicSecretKey<I>): NamedVerifier<Asym>;

/**
 * Create a named verifier from the public key in a certificate.
 * @param cert - Certificate.
 * @param opts - Certificate import options.
 */
export function createVerifier(cert: Certificate, opts?: ImportCertOptions<SigningAlgorithm>): Promise<NamedVerifier.PublicKey>;

export function createVerifier(arg1: any, arg2: any = {}, arg3?: any): any {
  if (arg3) {
    return new NamedCryptoVerifier(arg1, arg2, arg3);
  }
  if (isPublicSecretKey(arg2)) {
    return new PlainCryptoVerifier(arg1, arg2);
  }
  return certVerifiers.importCert(arg1, arg2);
}

const certVerifiers = new ImportCertCached(NamedCryptoVerifier, SigningAlgorithmListSlim);
