import type { NameLike } from "@ndn/packet";
import { assert } from "@ndn/util";
import { type IsEmptyObject } from "type-fest";

import { ECDSA } from "../algo/mod";
import type { KeyChain } from "../store/mod";
import { generateKeyInternal } from "./impl-generate";
import { createSigner } from "./signing-signer";
import { createVerifier } from "./signing-verifier";
import { CryptoAlgorithm, type NamedSigner, type NamedVerifier, type SigningAlgorithm } from "./types";

type SigningOptG<I, Asym extends boolean, G> =
  IsEmptyObject<G> extends true ?
    [SigningAlgorithm<I, Asym, G>, G?] :
    [SigningAlgorithm<I, Asym, G>, G];

/**
 * Generate a pair of signer and verifier with the default ECDSA signing algorithm.
 * @param name - Key name (used as-is) or subject name (forming key name with random *KeyId*).
 */
export async function generateSigningKey(
  name: NameLike,
): Promise<[NamedSigner.PrivateKey, NamedVerifier.PublicKey]>;

/**
 * Generate a pair of signer and verifier with the default ECDSA signing algorithm, and save to KeyChain.
 * @param keyChain - Target KeyChain.
 * @param name - Key name (used as-is) or subject name (forming key name with random *KeyId*).
 */
export async function generateSigningKey(
  keyChain: KeyChain,
  name: NameLike,
): Promise<[NamedSigner.PrivateKey, NamedVerifier.PublicKey]>;

/**
 * Generate a pair of signer and verifier.
 * @param name - Key name (used as-is) or subject name (forming key name with random *KeyId*).
 * @param a - Signing algorithm and key generation options.
 */
export async function generateSigningKey<I, Asym extends boolean, G>(
  name: NameLike,
  ...a: SigningOptG<I, Asym, G>
): Promise<[NamedSigner<Asym>, NamedVerifier<Asym>]>;

/**
 * Generate a pair of signer and verifier, and save to KeyChain.
 * @param keyChain - Target KeyChain.
 * @param name - Key name (used as-is) or subject name (forming key name with random *KeyId*).
 * @param a - Signing algorithm and key generation options.
 */
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
