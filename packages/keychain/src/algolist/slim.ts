import { ECDSA } from "../algo/mod";
import type { CryptoAlgorithm, EncryptionAlgorithm, SigningAlgorithm } from "../key/mod";

/**
 * A slim list of signing algorithms.
 * This list currently contains ECDSA.
 */
export const SigningAlgorithmListSlim: readonly SigningAlgorithm[] = [
  ECDSA,
];

/**
 * A slim list of encryption algorithms.
 * This list is currently empty.
 */
export const EncryptionAlgorithmListSlim: readonly EncryptionAlgorithm[] = [
];

/** A slim list of crypto algorithms. */
export const CryptoAlgorithmListSlim: readonly CryptoAlgorithm[] = [
  ...SigningAlgorithmListSlim,
  ...EncryptionAlgorithmListSlim,
];
