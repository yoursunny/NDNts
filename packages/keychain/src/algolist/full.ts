import type { CryptoAlgorithm } from "../key/mod";
import { EncryptionAlgorithmListFull } from "./full-encryption";
import { SigningAlgorithmListFull } from "./full-signing";

/**
 * A full list of crypto algorithms.
 *
 * @remarks
 * This list encompasses {@link SigningAlgorithmListFull} and {@link EncryptionAlgorithmListFull}.
 */
export const CryptoAlgorithmListFull: readonly CryptoAlgorithm[] = [
  ...SigningAlgorithmListFull,
  ...EncryptionAlgorithmListFull,
];
