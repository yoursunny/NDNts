import { Decoder, Encoder, EvDecoder } from "@ndn/tlv";

import { Encrypted } from "../crypto-common";
import { TT } from "./an";

const EVD = new EvDecoder<Encrypted>("EncryptedPayload", undefined)
  .add(TT.InitializationVector, (t, { value }) => t.iv = value, { required: true })
  .add(TT.AuthenticationTag, (t, { value }) => t.t = value, { required: true })
  .add(TT.EncryptedPayload, (t, { value }) => t.c = value, { required: true });

export function decode(wire: Uint8Array): Encrypted {
  const decoder = new Decoder(wire);
  return EVD.decodeValue({} as any, decoder);
}

export function encode({ iv, t, c }: Encrypted): Uint8Array {
  const encoder = new Encoder();
  encoder.prependValue(
    [TT.InitializationVector, iv],
    [TT.AuthenticationTag, t],
    [TT.EncryptedPayload, c],
  );
  return encoder.output;
}
