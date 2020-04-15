import { Decoder, Encoder, EvDecoder } from "@ndn/tlv";

import { Encrypted } from "../crypto-common";
import { TT } from "./an";

const EVD = new EvDecoder<Encrypted>("ChallengeRequest", undefined)
  .add(TT.InitializationVector, (t, { value }) => t.iv = value, { required: true })
  .add(TT.EncryptedPayload, (t, { value }) => t.ciphertext = value, { required: true });

export function decode(wire: Uint8Array): Encrypted {
  const decoder = new Decoder(wire);
  return EVD.decodeValue({} as any, decoder);
}

export function encode({ iv, ciphertext }: Encrypted): Uint8Array {
  const encoder = new Encoder();
  encoder.prependValue(
    [TT.InitializationVector, iv],
    [TT.EncryptedPayload, ciphertext],
  );
  return encoder.output;
}
