import { AESCBC, AESCTR, AESGCM, RSAOAEP } from "../algo/mod";
import type { EncryptionAlgorithm } from "../key/mod";

/**
 * A full list of encryption algorithms.
 * This list is currently empty.
 */
export const EncryptionAlgorithmListFull: readonly EncryptionAlgorithm[] = [
  AESCBC,
  AESCTR,
  AESGCM,
  RSAOAEP,
];
