import DefaultWeakMap from "mnemonist/default-weak-map.js";

import { CounterIvGen, type IvGen } from "../iv/mod";
import type { CryptoAlgorithm } from "../key/mod";
import { AesBlockSize, AesCommon, type AesEncryption, type AesGenParams } from "./aes-common";

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
 * Since the security of AES-GCM depends on having unique IVs, the application is recommended to
 * check IVs using CounterIvChecker type.
 */
export const AESGCM: AesEncryption<{}, AESGCM.GenParams> = new (class extends AesCommon<{}, AESGCM.GenParams> {
  protected override readonly name = "AES-GCM";
  public override readonly uuid = "a7e27aee-2f10-4150-bd6b-5e667c006274";
  public override readonly ivLength = 12;
  protected override getIvGen(key: CryptoAlgorithm.SecretKey<{}>) {
    return ivgens.get(key);
  }

  protected override allowAdditionalData = true;
  protected override tagSize = 128 / 8;
  protected override defaultInfo = {};
})();

export namespace AESGCM {
  export interface GenParams extends AesGenParams {}
}
