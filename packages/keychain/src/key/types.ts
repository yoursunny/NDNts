import type { Decrypter, Encrypter, KeyLocator, LLDecrypt, LLEncrypt, LLSign, LLVerify, Name, Signer, Verifier } from "@ndn/packet";
import type * as asn1 from "@yoursunny/asn1";

/** Identify kind of key. */
export type KeyKind = "private"|"public"|"secret";
export namespace KeyKind {
  /** Pick "private" or "secret" based on whether the algorithm is asymmetric. */
  export type PrivateSecret<Asym extends boolean> =
    Asym extends true ? "private" : Asym extends false ? "secret" : "private"|"secret";
  /** Pick "public" or "secret" based on whether the algorithm is asymmetric. */
  export type PublicSecret<Asym extends boolean> =
    Asym extends true ? "public" : Asym extends false ? "secret" : "public"|"secret";
}
export const KeyKind = Symbol("KeyChain.KeyKind");

interface Key<K extends KeyKind> {
  readonly name: Name;
  readonly [KeyKind]: K;
  readonly spki?: "public" extends K ? Uint8Array : never;
}

/** Named private key. */
export type PrivateKey = Key<"private">;
/** Named public key. */
export type PublicKey = Key<"public">;
/** Named secret key. */
export type SecretKey = Key<"secret">;

/** Named private key or secret key signer. */
export interface NamedSigner<Asym extends boolean = any> extends Key<KeyKind.PrivateSecret<Asym>>, Signer {
  readonly sigType: number;

  /** Create a Signer that signs with this private key but a different KeyLocator. */
  withKeyLocator: (keyLocator: KeyLocator.CtorArg) => Signer;
}
export namespace NamedSigner {
  /** Named private key signer. */
  export type PrivateKey = NamedSigner<true>;
  /** Named secret key signer. */
  export type SecretKey = NamedSigner<false>;
}

/** Named public key or secret key verifier. */
export interface NamedVerifier<Asym extends boolean = any> extends Key<KeyKind.PublicSecret<Asym>>, Verifier {
  readonly sigType: number;
}
export namespace NamedVerifier {
  /** Named public key verifier. */
  export type PublicKey = NamedVerifier<true>;
  /** Named secret key verifier. */
  export type SecretKey = NamedVerifier<false>;
}

/** Named public key or secret key encrypter. */
export interface NamedEncrypter<Asym extends boolean = any> extends Key<KeyKind.PublicSecret<Asym>>, Encrypter {
}
export namespace NamedEncrypter {
  /** Named public key encrypter. */
  export type PublicKey = NamedEncrypter<true>;
  /** Named secret key encrypter. */
  export type SecretKey = NamedEncrypter<false>;
}

/** Named private key or secret key decrypter. */
export interface NamedDecrypter<Asym extends boolean = any> extends Key<KeyKind.PrivateSecret<Asym>>, Decrypter {
}
export namespace NamedDecrypter {
  /** Named private key decrypter. */
  export type PrivateKey = NamedDecrypter<true>;
  /** Named secret key decrypter. */
  export type SecretKey = NamedDecrypter<false>;
}

/** WebCrypto based algorithm implementation. */
export interface CryptoAlgorithm<I = any, Asym extends boolean = any, G = any> {
  /**
   * Identifies an algorithm in storage.
   * This should be changed when the serialization format changes.
   */
  readonly uuid: string;

  readonly keyUsages: Asym extends true ? Record<"private"|"public", KeyUsage[]> :
  Asym extends false ? Record<"secret", KeyUsage[]> : {};

  /** Generate key pair or secret key. */
  cryptoGenerate: (params: G, extractable: boolean)
  => Promise<Asym extends true ? CryptoAlgorithm.GeneratedKeyPair<I> :
  Asym extends false ? CryptoAlgorithm.GeneratedSecretKey<I> : never>;

  /**
   * Import public key from SPKI.
   *
   * This should only appear on asymmetric algorithm.
   */
  importSpki?: (spki: Uint8Array, der: asn1.ElementBuffer) => Promise<CryptoAlgorithm.PublicKey<I>>;
}

export namespace CryptoAlgorithm {
  export function isAsym<I, G>(algo: CryptoAlgorithm<I, any, G>): algo is CryptoAlgorithm<I, true, G> {
    const t = algo as CryptoAlgorithm<I, true, G>;
    return Array.isArray(t.keyUsages.private) && Array.isArray(t.keyUsages.public);
  }

  export function isSym<I, G>(algo: CryptoAlgorithm<I, any, G>): algo is CryptoAlgorithm<I, false, G> {
    const t = algo as CryptoAlgorithm<I, false, G>;
    return Array.isArray(t.keyUsages.secret);
  }

  export function isSigning<I, Asym extends boolean = any, G = any>(
      algo: CryptoAlgorithm<I, Asym, G>,
  ): algo is SigningAlgorithm<I, Asym, G> {
    const t = algo as SigningAlgorithm<I, Asym, G>;
    return typeof t.sigType === "number" &&
           typeof t.makeLLSign === "function" &&
           typeof t.makeLLVerify === "function";
  }

  export function isEncryption<I, Asym extends boolean = any, G = any>(
      algo: CryptoAlgorithm<I, Asym, G>,
  ): algo is EncryptionAlgorithm<I, Asym, G> {
    const t = algo as EncryptionAlgorithm<I, Asym, G>;
    return typeof t.makeLLEncrypt === "function" &&
           typeof t.makeLLDecrypt === "function";
  }

  export interface PrivateKey<I = any> {
    privateKey: CryptoKey;
    info: I;
  }

  export interface PublicKey<I = any> {
    publicKey: CryptoKey;
    spki: Uint8Array;
    info: I;
  }

  export interface SecretKey<I = any> {
    secretKey: CryptoKey;
    info: I;
  }

  export type PrivateSecretKey<I = any, Asym extends boolean = any> =
    Asym extends true ? PrivateKey<I> : Asym extends false ? SecretKey<I> : (PrivateKey<I>|SecretKey<I>);

  export type PublicSecretKey<I = any, Asym extends boolean = any> =
    Asym extends true ? PublicKey<I> : Asym extends false ? SecretKey<I> : (PublicKey<I>|SecretKey<I>);

  export interface GeneratedKeyPair<I = any> extends PrivateKey<I>, PublicKey<I> {
    jwkImportParams: AlgorithmIdentifier;
  }

  export interface GeneratedSecretKey<I = any> extends SecretKey<I> {
    jwkImportParams: AlgorithmIdentifier;
  }
}

/** WebCrypto based signing algorithm implementation. */
export interface SigningAlgorithm<I = any, Asym extends boolean = any, G = any> extends CryptoAlgorithm<I, Asym, G> {
  readonly sigType: number;

  makeLLSign: (key: CryptoAlgorithm.PrivateSecretKey<I, Asym>) => LLSign;
  makeLLVerify: (key: CryptoAlgorithm.PublicSecretKey<I, Asym>) => LLVerify;
}

/** WebCrypto based encryption algorithm implementation. */
export interface EncryptionAlgorithm<I = any, Asym extends boolean = any, G = any> extends CryptoAlgorithm<I, Asym, G> {
  makeLLEncrypt: (key: CryptoAlgorithm.PublicSecretKey<I, Asym>) => LLEncrypt;
  makeLLDecrypt: (key: CryptoAlgorithm.PrivateSecretKey<I, Asym>) => LLDecrypt;
}
