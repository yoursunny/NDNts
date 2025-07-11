import type { KeyLocator, LLDecrypt, LLEncrypt, LLSign, LLVerify, Name, Signer, Verifier } from "@ndn/packet";
import type * as asn1 from "@yoursunny/asn1";

type If<Cond, True, False, Unknown = True | False> = Cond extends true ? True : Cond extends false ? False : Unknown;

/** Identify kind of key. */
export type KeyKind = "private" | "public" | "secret";
export namespace KeyKind {
  /** Pick "private" or "secret" based on whether the algorithm is asymmetric. */
  export type PrivateSecret<Asym extends boolean> = If<Asym, "private", "secret">;
  /** Pick "public" or "secret" based on whether the algorithm is asymmetric. */
  export type PublicSecret<Asym extends boolean> = If<Asym, "public", "secret">;
}
export const KeyKind = Symbol("@ndn/keychain#KeyKind");

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
  /** SigInfo.sigType number for signatures created by this signer. */
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
  /** SigInfo.sigType number for signatures accepted by this verifier. */
  readonly sigType: number;
}
export namespace NamedVerifier {
  /** Named public key verifier. */
  export type PublicKey = NamedVerifier<true>;
  /** Named secret key verifier. */
  export type SecretKey = NamedVerifier<false>;
}

/** Named public key or secret key encrypter. */
export interface NamedEncrypter<Asym extends boolean = any> extends Key<KeyKind.PublicSecret<Asym>>, LLEncrypt.Key {
}
export namespace NamedEncrypter {
  /** Named public key encrypter. */
  export type PublicKey = NamedEncrypter<true>;
  /** Named secret key encrypter. */
  export type SecretKey = NamedEncrypter<false>;
}

/** Named private key or secret key decrypter. */
export interface NamedDecrypter<Asym extends boolean = any> extends Key<KeyKind.PrivateSecret<Asym>>, LLDecrypt.Key {
}
export namespace NamedDecrypter {
  /** Named private key decrypter. */
  export type PrivateKey = NamedDecrypter<true>;
  /** Named secret key decrypter. */
  export type SecretKey = NamedDecrypter<false>;
}

/**
 * WebCrypto based algorithm implementation.
 * @typeParam I - Algorithm-specific per-key information.
 * @typeParam Asym - Whether the algorithm is asymmetric.
 * @typeParam G - Key generation parameters.
 */
export interface CryptoAlgorithm<I = any, Asym extends boolean = any, G = any> {
  /**
   * Identifies an algorithm in storage.
   *
   * @remarks
   * This should be changed when the serialization format changes.
   */
  readonly uuid: string;

  /**
   * WebCrypto KeyUsages for generated keys.
   * These are specified separately for private/public/secret keys.
   */
  readonly keyUsages: If<Asym,
    Record<"private" | "public", readonly KeyUsage[]>,
    Record<"secret", readonly KeyUsage[]>,
    {}>;

  /**
   * Generate key pair (for asymmetric algorithm) or secret key (for symmetric algorithm).
   * @param params - Key generation parameters.
   * @param extractable - Whether to generate as extractable WebCrypto key.
   * @returns Generated key pair or secret key.
   *
   * @remarks
   * Some algorithms allow importing an existing key pair from a serialization format such as
   * PKCS#8 or JWK. This could be supported by passing the serialized key as part of `params`,
   * and then importing instead of generating in this method.
   */
  cryptoGenerate: (params: G, extractable: boolean) => Promise<
    If<Asym, CryptoAlgorithm.GeneratedKeyPair<I>, CryptoAlgorithm.GeneratedSecretKey<I>, never>>;

  /**
   * Import public key from SubjectPublicKeyInfo.
   *
   * @remarks
   * This should only appear on asymmetric algorithm.
   */
  importSpki?: (spki: Uint8Array, der: asn1.ElementBuffer) => Promise<CryptoAlgorithm.PublicKey<I>>;
}

export namespace CryptoAlgorithm {
  /** Determine whether `algo` is an asymmetric algorithm. */
  export function isAsym<I, G>(algo: CryptoAlgorithm<I, any, G>): algo is CryptoAlgorithm<I, true, G> {
    const t = algo as CryptoAlgorithm<I, true, G>;
    return Array.isArray(t.keyUsages.private) && Array.isArray(t.keyUsages.public);
  }

  /** Determine whether `algo` is a symmetric algorithm. */
  export function isSym<I, G>(algo: CryptoAlgorithm<I, any, G>): algo is CryptoAlgorithm<I, false, G> {
    const t = algo as CryptoAlgorithm<I, false, G>;
    return Array.isArray(t.keyUsages.secret);
  }

  /** Determine whether `algo` is a signing algorithm. */
  export function isSigning<I, Asym extends boolean = any, G = any>(algo: CryptoAlgorithm<I, Asym, G>): algo is SigningAlgorithm<I, Asym, G> {
    const t = algo as SigningAlgorithm<I, Asym, G>;
    return typeof t.sigType === "number" &&
      typeof t.makeLLSign === "function" &&
      typeof t.makeLLVerify === "function";
  }

  /** Determine whether `algo` is an encryption algorithm. */
  export function isEncryption<I, Asym extends boolean = any, G = any>(algo: CryptoAlgorithm<I, Asym, G>): algo is EncryptionAlgorithm<I, Asym, G> {
    const t = algo as EncryptionAlgorithm<I, Asym, G>;
    return typeof t.makeLLEncrypt === "function" &&
      typeof t.makeLLDecrypt === "function";
  }

  /** Private key used by an asymmetric algorithm. */
  export interface PrivateKey<I = any> {
    privateKey: CryptoKey;
    info: I;
  }

  /** Public key used by an asymmetric algorithm. */
  export interface PublicKey<I = any> {
    publicKey: CryptoKey;
    spki: Uint8Array;
    info: I;
  }

  /** Secret key used by a symmetric algorithm. */
  export interface SecretKey<I = any> {
    secretKey: CryptoKey;
    info: I;
  }

  /** Pick {@link PrivateKey} or {@link SecretKey} based on whether the algorithm is asymmetric. */
  export type PrivateSecretKey<I = any, Asym extends boolean = any> = If<Asym, PrivateKey<I>, SecretKey<I>>;

  /** Pick {@link PublicKey} or {@link SecretKey} based on whether the algorithm is asymmetric. */
  export type PublicSecretKey<I = any, Asym extends boolean = any> = If<Asym, PublicKey<I>, SecretKey<I>>;

  /** Generated public/private key pair of an asymmetric algorithm. */
  export interface GeneratedKeyPair<I = any> extends PrivateKey<I>, PublicKey<I> {
    jwkImportParams: AlgorithmIdentifier;
  }

  /** Generated secret key of a symmetric algorithm. */
  export interface GeneratedSecretKey<I = any> extends SecretKey<I> {
    jwkImportParams: AlgorithmIdentifier;
  }
}

/**
 * WebCrypto based signing algorithm implementation.
 * @typeParam I - Algorithm-specific per-key information.
 * @typeParam Asym - Whether the algorithm is asymmetric.
 * @typeParam G - Key generation parameters.
 */
export interface SigningAlgorithm<I = any, Asym extends boolean = any, G = any> extends CryptoAlgorithm<I, Asym, G> {
  /** SigInfo.sigType number for signatures produced by this algorithm. */
  readonly sigType: number;

  /**
   * Create a low level signing function from private key (in asymmetric algorithm) or
   * secret key (in symmetric algorithm).
   */
  makeLLSign: If<Asym,
    (key: CryptoAlgorithm.PrivateKey<I>) => LLSign,
    (key: CryptoAlgorithm.SecretKey<I>) => LLSign,
    unknown>;

  /**
   * Create a low level verification function from public key (in asymmetric algorithm) or
   * secret key (in symmetric algorithm).
   */
  makeLLVerify: If<Asym,
    (key: CryptoAlgorithm.PublicKey<I>) => LLVerify,
    (key: CryptoAlgorithm.SecretKey<I>) => LLVerify,
    unknown>;
}

/**
 * WebCrypto based encryption algorithm implementation.
 * @typeParam I - Algorithm-specific per-key information.
 * @typeParam Asym - Whether the algorithm is asymmetric.
 * @typeParam G - Key generation parameters.
 */
export interface EncryptionAlgorithm<I = any, Asym extends boolean = any, G = any> extends CryptoAlgorithm<I, Asym, G> {
  /**
   * Create a low level encryption function from public key (in asymmetric algorithm) or
   * secret key (in symmetric algorithm).
   */
  makeLLEncrypt: If<Asym,
    (key: CryptoAlgorithm.PublicKey<I>) => LLEncrypt,
    (key: CryptoAlgorithm.SecretKey<I>) => LLEncrypt,
    unknown>;

  /**
   * Create a low level decryption function from private key (in asymmetric algorithm) or
   * secret key (in symmetric algorithm).
   */
  makeLLDecrypt: If<Asym,
    (key: CryptoAlgorithm.PrivateKey<I>) => LLDecrypt,
    (key: CryptoAlgorithm.SecretKey<I>) => LLDecrypt,
    unknown>;
}
