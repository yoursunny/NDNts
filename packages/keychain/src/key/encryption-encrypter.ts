import type { LLEncrypt, Name } from "@ndn/packet";
import { assert } from "@ndn/util";

import { EncryptionAlgorithmListSlim } from "../algolist/mod";
import type { Certificate, ValidityPeriod } from "../cert/mod";
import * as CertNaming from "../naming";
import { ImportCertCached, isPublicSecretKey } from "./impl-import-cert";
import { type CryptoAlgorithm, type EncryptionAlgorithm, KeyKind, type NamedEncrypter } from "./types";

class PlainCryptoEncrypter<I> {
  constructor(
      algo: EncryptionAlgorithm<I>,
      key: CryptoAlgorithm.PublicSecretKey<I>,
  ) {
    const pubkey = key as CryptoAlgorithm.PublicKey<I>;
    if (pubkey.publicKey) {
      this[KeyKind] = "public";
      this.llEncrypt = (algo as EncryptionAlgorithm<I, true>).makeLLEncrypt(pubkey);
      this.spki = pubkey.spki;
    } else {
      this[KeyKind] = "secret";
      this.llEncrypt = (algo as EncryptionAlgorithm<I, false>).makeLLEncrypt(key as CryptoAlgorithm.SecretKey<I>);
    }
  }

  public readonly [KeyKind]: "public" | "secret";
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

/** Create a plain encrypter from crypto key. */
export function createEncrypter<I>(algo: EncryptionAlgorithm<I>, key: CryptoAlgorithm.PublicSecretKey<I>): LLEncrypt.Key;

/** Create a named encrypter from crypto key. */
export function createEncrypter<I, Asym extends boolean>(name: Name, algo: EncryptionAlgorithm<I, Asym>, key: CryptoAlgorithm.PublicSecretKey<I>): NamedEncrypter<Asym>;

/** Create a named encrypter from certificate public key. */
export function createEncrypter(cert: Certificate, opts?: createEncrypter.ImportCertOptions): Promise<NamedEncrypter.PublicKey>;

export function createEncrypter(arg1: any, arg2: any = {}, arg3?: any): any {
  if (arg3) {
    return new NamedCryptoEncrypter(arg1, arg2, arg3);
  }
  if (isPublicSecretKey(arg2)) {
    return new PlainCryptoEncrypter(arg1, arg2);
  }
  return certEncrypters.importCert(arg1, arg2 as createEncrypter.ImportCertOptions);
}

const certEncrypters = new ImportCertCached(NamedCryptoEncrypter, EncryptionAlgorithmListSlim);

export namespace createEncrypter {
  /** createEncrypter options when importing public key from a certificate. */
  export interface ImportCertOptions {
    /**
     * List of recognized algorithms.
     * Default is EncryptionAlgorithmListSlim.
     * Use EncryptionAlgorithmListFull for all algorithms, at the cost of larger bundle size.
     */
    algoList?: readonly EncryptionAlgorithm[];

    /**
     * Whether to check certificate ValidityPeriod.
     * Default is true, which throws an error if current timestamp is not within ValidityPeriod.
     */
    checkValidity?: boolean;

    /**
     * Current timestamp for checking ValidityPeriod.
     * Default is Date.now().
     */
    now?: ValidityPeriod.TimestampInput;
  }
}
