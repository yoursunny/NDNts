import { ECDSA, Ed25519, HMAC, RSA } from "../algo/mod";
import type { SigningAlgorithm } from "../key/mod";

/**
 * A full list of signing algorithms.
 *
 * @remarks
 * This list currently contains {@link ECDSA}, {@link RSA}, {@link HMAC}, and {@link Ed25519}.
 */
export const SigningAlgorithmListFull: readonly SigningAlgorithm[] = [
  ECDSA,
  RSA,
  HMAC,
  Ed25519,
];
