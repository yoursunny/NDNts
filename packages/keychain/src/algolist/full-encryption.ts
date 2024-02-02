import { AESCBC, AESCTR, AESGCM, RSAOAEP } from "../algo/mod";
import type { EncryptionAlgorithm } from "../key/mod";

/**
 * A full list of encryption algorithms.
 *
 * @remarks
 * The *full* list contains all implemented algorithms.
 * This list currently contains {@link AESCBC}, {@link AESCTR}, {@link AESGCM},
 * and {@link RSAOAEP}.
 *
 * This can be used in place of {@link EncryptionAlgorithmListSlim} to support more algorithms,
 * at the cost of larger bundle size. If you know exactly which algorithms are needed, you can
 * also explicitly import them and form an array.
 */
export const EncryptionAlgorithmListFull: readonly EncryptionAlgorithm[] = [
  AESCBC,
  AESCTR,
  AESGCM,
  RSAOAEP,
];
