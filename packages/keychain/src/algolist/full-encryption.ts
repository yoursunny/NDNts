import { AESCBC, AESCTR, AESGCM, RSAOAEP } from "../algo/mod";
import type { EncryptionAlgorithm } from "../key/mod";

/**
 * A full list of encryption algorithms.
 * This list currently contains AES-CBC, AES-CTR, AES-GCM, and RSA-OAEP.
 */
export const EncryptionAlgorithmListFull: readonly EncryptionAlgorithm[] = [
  AESCBC,
  AESCTR,
  AESGCM,
  RSAOAEP,
];
