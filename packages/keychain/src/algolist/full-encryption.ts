import { AES, RSAOAEP } from "../algo/mod";
import type { EncryptionAlgorithm } from "../key/mod";

/**
 * A full list of encryption algorithms.
 * This list is currently empty.
 */
export const EncryptionAlgorithmListFull: readonly EncryptionAlgorithm[] = [
  AES.CBC,
  AES.CTR,
  AES.GCM,
  RSAOAEP,
];
