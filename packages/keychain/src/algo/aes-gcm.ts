import DefaultWeakMap from "mnemonist/default-weak-map.js";

import { type IvGen, CounterIvGen } from "../iv/mod";
import type { CryptoAlgorithm } from "../key/mod";
import { type AesEncryption, type AesGenParams, AesBlockSize, AesCommon } from "./aes-common";

const ivgens = new DefaultWeakMap<CryptoAlgorithm.SecretKey<{}>, IvGen>(
  () => new CounterIvGen({
    ivLength: AESGCM.ivLength,
    counterBits: 32,
    blockSize: AesBlockSize,
  }));

/**
 * AES-GCM encryption algorithm.
 *
 * Initialization Vectors must be 12 octets.
 * During encryption, if IV is unspecified, it is constructed with two parts:
 * @li a 64-bit random number, generated each time a private key instance is constructed;
 * @li a 32-bit counter starting from zero.
 *
 * During decryption, quality of IV is not automatically checked.
 * Since the security of AES-CTR depends on having unique IVs, the application is recommended to
 * check IVs using CounterIvChecker type.
 */
export const AESGCM: AesEncryption<{}, AESGCM.GenParams> = new AesCommon("AES-GCM", "a7e27aee-2f10-4150-bd6b-5e667c006274", {
  secretKeyUsages: ["encrypt", "decrypt"],
  ivLength: 12,
  getIvGen: (key) => ivgens.get(key),
  allowAdditionalData: true,
  tagSize: 128 / 8,
  defaultInfo: {},
});

export namespace AESGCM {
  export interface GenParams extends AesGenParams {}
}
