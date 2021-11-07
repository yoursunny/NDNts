import { ECDSA, HMAC, RSA } from "../algo/mod";
import type { SigningAlgorithm } from "../key/mod";

/**
 * A full list of signing algorithms.
 * This list currently contains ECDSA.
 */
export const SigningAlgorithmListFull: readonly SigningAlgorithm[] = [
  ECDSA,
  RSA,
  HMAC,
];
