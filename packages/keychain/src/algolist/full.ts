import type { CryptoAlgorithm } from "../key/mod";
import { EncryptionAlgorithmListFull } from "./full-encryption";
import { SigningAlgorithmListFull } from "./full-signing";

/**
 * A full list of crypto algorithms.
 * This list encompasses SigningAlgorithmListFull and EncryptionAlgorithmListFull.
 */
export const CryptoAlgorithmListFull: readonly CryptoAlgorithm[] = [
  ...SigningAlgorithmListFull,
  ...EncryptionAlgorithmListFull,
];
