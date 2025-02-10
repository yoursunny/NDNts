import { type KeyLocator, LLSign, type Name, Signer } from "@ndn/packet";
import { assert } from "@ndn/util";

import * as CertNaming from "../naming";
import { type CryptoAlgorithm, KeyKind, type NamedSigner, type SigningAlgorithm } from "./types";

class PlainCryptoSigner<I> implements Signer {
  constructor(
      algo: SigningAlgorithm<I>,
      key: CryptoAlgorithm.PrivateSecretKey<I>,
  ) {
    if ("privateKey" in key) {
      this[KeyKind] = "private";
      this.llSign = (algo as SigningAlgorithm<I, true>).makeLLSign(key);
    } else {
      this[KeyKind] = "secret";
      this.llSign = (algo as SigningAlgorithm<I, false>).makeLLSign(key);
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

/**
 * Create a plain signer from crypto key.
 * @param algo - Signing algorithm.
 * @param key - Private key or secret key, which must match `algo`.
 */
export function createSigner<I>(algo: SigningAlgorithm<I>, key: CryptoAlgorithm.PrivateSecretKey<I>): Signer;

/**
 * Create a named signer from crypto key.
 * @param name - Key name.
 * @param algo - Signing algorithm.
 * @param key - Private key or secret key, which must match `algo`.
 */
export function createSigner<I, Asym extends boolean>(name: Name, algo: SigningAlgorithm<I, Asym>, key: CryptoAlgorithm.PrivateSecretKey<I>): NamedSigner<Asym>;

export function createSigner(arg1: any, arg2: any, arg3?: any): any {
  if (arg3) {
    return new NamedCryptoSigner(arg1, arg2, arg3);
  }
  return new PlainCryptoSigner(arg1, arg2);
}
