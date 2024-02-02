import { ECDSA, Ed25519, HMAC, RSA } from "../algo/mod";
import type { SigningAlgorithm } from "../key/mod";

/**
 * A full list of signing algorithms.
 *
 * @remarks
 * The *full* list contains all implemented algorithms.
 * This list currently contains {@link ECDSA}, {@link RSA}, {@link HMAC}, and {@link Ed25519}.
 *
 * This can be used in place of {@link SigningAlgorithmListSlim} to support more algorithms,
 * at the cost of larger bundle size. If you know exactly which algorithms are needed, you can
 * also explicitly import them and form an array.
 */
export const SigningAlgorithmListFull: readonly SigningAlgorithm[] = [
  ECDSA,
  RSA,
  HMAC,
  Ed25519,
];
