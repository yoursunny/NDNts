import type { CryptoAlgorithm } from "../key/mod";
import { EncryptionAlgorithmListFull } from "./full-encryption";
import { SigningAlgorithmListFull } from "./full-signing";

/**
 * A full list of crypto algorithms.
 *
 * @remarks
 * The *full* list contains all implemented algorithms.
 * This list encompasses {@link SigningAlgorithmListFull} and {@link EncryptionAlgorithmListFull}.
 *
 * This can be used in place of {@link CryptoAlgorithmListSlim} to support more algorithms,
 * at the cost of larger bundle size. If you know exactly which algorithms are needed, you can
 * also explicitly import them and form an array.
 */
export const CryptoAlgorithmListFull: readonly CryptoAlgorithm[] = [
  ...SigningAlgorithmListFull,
  ...EncryptionAlgorithmListFull,
];
