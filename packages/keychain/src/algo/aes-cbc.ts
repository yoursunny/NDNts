import { RandomIvGen } from "../iv/mod";
import { type AesEncryption, type AesGenParams, AesCommon } from "./aes-common";

/**
 * AES-CBC encryption algorithm.
 *
 * Initialization Vectors must be 16 octets.
 * During encryption, if IV is unspecified, it is randomly generated.
 * During decryption, quality of IV is not checked.
 */
export const AESCBC: AesEncryption<{}, AESCBC.GenParams> = new AesCommon("AES-CBC", "a3840ac4-b29d-4ab5-a255-2894ec254223", {
  secretKeyUsages: ["encrypt", "decrypt"],
  ivLength: 16,
  getIvGen: () => new RandomIvGen(AESCBC.ivLength),
  allowAdditionalData: false,
  tagSize: 0,
  defaultInfo: {},
});

export namespace AESCBC {
  export interface GenParams extends AesGenParams {}
}
