import type { LLDecrypt, LLEncrypt } from "@ndn/packet";
import { Decoder, Encoder, EvDecoder } from "@ndn/tlv";

import { TT } from "./an";

const EVD = new EvDecoder<LLDecrypt.Params>("EncryptedPayload")
  .add(TT.InitializationVector, (t, { value }) => t.iv = value, { required: true })
  .add(TT.AuthenticationTag, (t, { value }) => t.authenticationTag = value, { required: true })
  .add(TT.EncryptedPayload, (t, { value }) => t.ciphertext = value, { required: true });

export function decode(wire: Uint8Array): LLDecrypt.Params {
  const decoder = new Decoder(wire);
  return EVD.decodeValue({} as any, decoder);
}

export function encode({ iv, authenticationTag, ciphertext }: LLEncrypt.Result): Uint8Array {
  const encoder = new Encoder();
  encoder.prependValue(
    [TT.InitializationVector, iv],
    [TT.AuthenticationTag, authenticationTag],
    [TT.EncryptedPayload, ciphertext],
  );
  return encoder.output;
}
