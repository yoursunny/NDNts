import { type LLDecrypt, type LLEncrypt, Name, TT as l3TT } from "@ndn/packet";
import { type Decoder, type Encoder, EvDecoder } from "@ndn/tlv";
import { assert } from "@ndn/util";

import { TT } from "./an";

const EVD = new EvDecoder<EncryptedContent>("EncryptedContent", TT.EncryptedContent)
  .add(TT.EncryptedPayload, (t, { value }) => t.ciphertext = value, { required: true })
  .add(TT.InitializationVector, (t, { value }) => t.iv = value, { required: true })
  .add(l3TT.Name, (t, { decoder }) => t.name = decoder.decode(Name), { required: true });

/**
 * NAC encrypted content.
 *
 * @remarks
 * This is only applicable for application data, encrypted by AES-CBC.
 * Do not use this type for KDK and CK packets.
 */
export class EncryptedContent implements LLDecrypt.Params {
  public static decodeFrom(decoder: Decoder): EncryptedContent {
    return EVD.decode(new EncryptedContent(), decoder);
  }

  public static create({ ciphertext, iv }: LLEncrypt.Result, name: Name): EncryptedContent {
    assert(!!iv, "IV is required");
    const enc = new EncryptedContent();
    enc.ciphertext = ciphertext;
    enc.iv = iv;
    enc.name = name;
    return enc;
  }

  private constructor() {
    //
  }

  public ciphertext!: Uint8Array;
  public iv!: Uint8Array;
  public name!: Name;

  public encodeTo(encoder: Encoder): void {
    encoder.prependTlv(TT.EncryptedContent,
      [TT.EncryptedPayload, this.ciphertext],
      [TT.InitializationVector, this.iv],
      this.name,
    );
  }
}
