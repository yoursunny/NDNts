import DefaultWeakMap from "mnemonist/default-weak-map.js";

import { CounterIvGen, type IvGen } from "../iv/mod";
import type { CryptoAlgorithm } from "../key/mod";
import { AesBlockSize, AesCommon, type AesEncryption, type AesGenParams } from "./aes-common";

const ivgens = new DefaultWeakMap<CryptoAlgorithm.SecretKey<AESCTR.Info>, IvGen>(
  ({ info: { counterLength } }) => new CounterIvGen({
    ivLength: AESCTR.ivLength,
    counterBits: counterLength,
    blockSize: AesBlockSize,
  }));

/**
 * AES-CTR encryption algorithm.
 *
 * Initialization Vectors must be 16 octets.
 * During encryption, if IV is unspecified, it is constructed with two parts:
 * @li a 64-bit random number, generated each time a private key instance is constructed;
 * @li a 64-bit counter starting from zero.
 *
 * During decryption, quality of IV is not automatically checked.
 * Since the security of AES-CTR depends on having unique IVs, the application is recommended to
 * check IVs using CounterIvChecker type.
 */
export const AESCTR: AesEncryption<AESCTR.Info, AESCTR.GenParams> = new AesCommon<AESCTR.Info, AESCTR.GenParams>("AES-CTR", "0ec985f2-88c0-4dd9-8b69-2c41bd639809", {
  secretKeyUsages: ["encrypt", "decrypt"],
  ivLength: 16,
  getIvGen: (key) => ivgens.get(key),
  allowAdditionalData: false,
  tagSize: 0,
  defaultInfo: {
    counterLength: 64,
  },
  modifyParams: (params: Partial<AesCtrParams & AesCbcParams>, { counterLength }: AESCTR.Info) => {
    params.counter = params.iv;
    delete params.iv;
    params.length = counterLength;
  },
});

export namespace AESCTR {
  export interface Info {
    /**
     * Specify number of bits in IV to use as counter.
     * This must be between 1 and 128. Default is 64.
     */
    counterLength: number;
  }

  export type GenParams = AesGenParams & Partial<Info>;
}
