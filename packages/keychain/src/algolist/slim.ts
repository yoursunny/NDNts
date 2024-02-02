import { ECDSA } from "../algo/mod";
import type { CryptoAlgorithm, EncryptionAlgorithm, SigningAlgorithm } from "../key/mod";

/**
 * A slim list of signing algorithms.
 *
 * @remarks
 * The *slim* list contains only the most commonly used algorithms, to reduce bundle size.
 * This list currently contains {@link ECDSA}.
 * If you need more algorithms, explicitly import them or use {@link SigningAlgorithmListFull}.
 */
export const SigningAlgorithmListSlim: readonly SigningAlgorithm[] = [
  ECDSA,
];

/**
 * A slim list of encryption algorithms.
 *
 * @remarks
 * The *slim* list contains only the most commonly used algorithms, to reduce bundle size.
 * This list is currently empty.
 * If you need more algorithms, explicitly import them or use {@link EncryptionAlgorithmListFull}.
 */
export const EncryptionAlgorithmListSlim: readonly EncryptionAlgorithm[] = [
];

/**
 * A slim list of crypto algorithms.
 *
 * @remarks
 * The *slim* list contains only the most commonly used algorithms, to reduce bundle size.
 * This list encompasses {@link SigningAlgorithmListSlim} and {@link EncryptionAlgorithmListSlim}.
 * If you need more algorithms, explicitly import them or use {@link CryptoAlgorithmListFull}.
 */
export const CryptoAlgorithmListSlim: readonly CryptoAlgorithm[] = [
  ...SigningAlgorithmListSlim,
  ...EncryptionAlgorithmListSlim,
];
