import { Decoder, EvDecoder } from "@ndn/tlv";

import { TT } from "./an";

function isCritical(tt: number): boolean {
  return !(tt >= 800 && tt <= 959 && tt % 4 === 0);
}

const EVD = new EvDecoder<LpPacket>("LpPacket", TT.LpPacket)
.setIsCritical(isCritical)
.add(TT.Fragment, (t, { value }) => t.fragment = value);

export class LpPacket {
  public static decodeFrom(decoder: Decoder): LpPacket {
    return EVD.decode(new LpPacket(), decoder);
  }

  public fragment?: Uint8Array;
}
