import type { CryptoAlgorithm, EncryptionAlgorithm, SigningAlgorithm } from "../types";
import * as AES from "./aes";
import { ECDSA } from "./ecdsa";
import { HMAC } from "./hmac";
import { RSA, RSAOAEP } from "./rsa";

export const SigningAlgorithmList: SigningAlgorithm[] = [
  ECDSA,
  RSA,
  HMAC,
];

export const EncryptionAlgorithmList: EncryptionAlgorithm[] = [
  AES.CBC,
  AES.CTR,
  AES.GCM,
  RSAOAEP,
];

export const CryptoAlgorithmList: CryptoAlgorithm[] = [
  ...SigningAlgorithmList,
  ...EncryptionAlgorithmList,
];
