import type { CryptoAlgorithm, SigningAlgorithm } from "../types";
import { ECDSA } from "./ecdsa";
import { HMAC } from "./hmac";
import { RSA } from "./rsa";

export const SigningAlgorithmList: Array<SigningAlgorithm<any>> = [
  ECDSA,
  RSA,
  HMAC,
];

export const CryptoAlgorithmList: Array<CryptoAlgorithm<any>> = [
  ...SigningAlgorithmList,
];
