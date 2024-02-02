import { AESCBC, AESCTR, AESGCM, RSAOAEP } from "../algo/mod";
import type { EncryptionAlgorithm } from "../key/mod";

/**
 * A full list of encryption algorithms.
 *
 * @remarks
 * This list currently contains {@link AESCBC}, {@link AESCTR}, {@link AESGCM},
 * and {@link RSAOAEP}.
 */
export const EncryptionAlgorithmListFull: readonly EncryptionAlgorithm[] = [
  AESCBC,
  AESCTR,
  AESGCM,
  RSAOAEP,
];
