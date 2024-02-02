import { RandomIvGen } from "../iv/mod";
import { AesCommon, type AesEncryption, type AesGenParams } from "./aes-common";

/**
 * AES-CBC encryption algorithm.
 *
 * @remarks
 * Initialization Vectors must be 16 octets.
 * During encryption, if IV is unspecified, it is randomly generated.
 * During decryption, quality of IV is not checked.
 */
export const AESCBC: AesEncryption<{}, AESCBC.GenParams> = new class extends AesCommon<{}, AESCBC.GenParams> {
  protected override readonly name = "AES-CBC";
  public override readonly uuid = "a3840ac4-b29d-4ab5-a255-2894ec254223";
  public override readonly ivLength = 16;
  protected override getIvGen() {
    return new RandomIvGen(this.ivLength);
  }

  protected override allowAdditionalData = false;
  protected override tagSize = 0;
  protected override defaultInfo = {};
}();

export namespace AESCBC {
  export interface GenParams extends AesGenParams {}
}
