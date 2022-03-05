import { ECDSA } from "../algo/mod";
import type { CryptoAlgorithm, EncryptionAlgorithm, SigningAlgorithm } from "../key/mod";

/**
 * A slim list of signing algorithms.
 * This list currently contains ECDSA.
 * If you need more algorithms, explicitly import them or use SigningAlgorithmListFull.
 */
export const SigningAlgorithmListSlim: readonly SigningAlgorithm[] = [
  ECDSA,
];

/**
 * A slim list of encryption algorithms.
 * This list is currently empty.
 * If you need more algorithms, explicitly import them or use EncryptionAlgorithmListFull.
 */
export const EncryptionAlgorithmListSlim: readonly EncryptionAlgorithm[] = [
];

/**
 * A slim list of crypto algorithms.
 * If you need more algorithms, explicitly import them or use CryptoAlgorithmListFull.
 */
export const CryptoAlgorithmListSlim: readonly CryptoAlgorithm[] = [
  ...SigningAlgorithmListSlim,
  ...EncryptionAlgorithmListSlim,
];
