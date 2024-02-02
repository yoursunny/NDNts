import type { NameLike } from "@ndn/packet";
import { assert } from "@ndn/util";
import type { IsEmptyObject } from "type-fest";

import type { KeyChain } from "../store/mod";
import { createDecrypter } from "./encryption-decrypter";
import { createEncrypter } from "./encryption-encrypter";
import { generateKeyInternal } from "./impl-generate";
import { CryptoAlgorithm, type EncryptionAlgorithm, type NamedDecrypter, type NamedEncrypter } from "./types";

type EncryptionOptG<I, Asym extends boolean, G> =
  IsEmptyObject<G> extends true ?
    [EncryptionAlgorithm<I, Asym, G>, G?] :
    [EncryptionAlgorithm<I, Asym, G>, G];

/**
 * Generate a pair of encrypter and decrypter.
 * @param name - Key name (used as-is) or subject name (forming key name with random *KeyId*).
 * @param a - Encryption algorithm and key generation options.
 */
export async function generateEncryptionKey<I, Asym extends boolean, G>(
  name: NameLike,
  ...a: EncryptionOptG<I, Asym, G>
): Promise<[NamedEncrypter<Asym>, NamedDecrypter<Asym>]>;

/**
 * Generate a pair of encrypter and decrypter, and save to KeyChain.
 * @param keyChain - Target KeyChain.
 * @param name - Key name (used as-is) or subject name (forming key name with random *KeyId*).
 * @param a - Encryption algorithm and key generation options.
 */
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
