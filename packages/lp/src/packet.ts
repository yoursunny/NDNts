import { NackHeader, TT as l3TT } from "@ndn/packet";
import { Decoder, Encoder, EvDecoder } from "@ndn/tlv";

import { TT } from "./mod";

function isCritical(tt: number): boolean {
  return !(tt >= 800 && tt <= 959 && tt % 4 === 0);
}

const EVD = new EvDecoder<LpPacket>("LpPacket", TT.LpPacket)
  .setIsCritical(isCritical)
  .add(l3TT.Nack, (t, { decoder }) => t.nack = decoder.decode(NackHeader))
  .add(TT.Fragment, (t, { value }) => t.fragment = value);

export class LpPacket {
  public static decodeFrom(decoder: Decoder): LpPacket {
    return EVD.decode(new LpPacket(), decoder);
  }

  public nack?: NackHeader;
  public fragment?: Uint8Array;

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(TT.LpPacket,
      this.nack,
      [TT.Fragment, Encoder.OmitEmpty, this.fragment],
    );
  }
}
