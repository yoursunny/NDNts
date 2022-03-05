import { ECDSA, HMAC, RSA } from "../algo/mod";
import type { SigningAlgorithm } from "../key/mod";

/**
 * A full list of signing algorithms.
 * This list currently contains ECDSA, RSA, and HMAC.
 */
export const SigningAlgorithmListFull: readonly SigningAlgorithm[] = [
  ECDSA,
  RSA,
  HMAC,
];
