import type { CryptoAlgorithm, SigningAlgorithm } from "../types";
import { ECDSA } from "./ecdsa";
import { HMAC } from "./hmac";
import { RSA } from "./rsa";

export const SigningAlgorithmList: ReadonlyArray<SigningAlgorithm<any>> = [
  ECDSA,
  RSA,
  HMAC,
];

export const CryptoAlgorithmList: ReadonlyArray<CryptoAlgorithm<any>> = [
  ...SigningAlgorithmList,
];
