import { Decoder } from "@ndn/tlv";

import { TT } from "./an";
import { LpPacket } from "./packet";

export class LpService {
  public rx = (iterable: AsyncIterable<Decoder.Tlv>) => {
    return this.rx_(iterable);
  }

  private async *rx_(iterable: AsyncIterable<Decoder.Tlv>): AsyncIterable<Decoder.Tlv> {
    for await (const tlv of iterable) {
      yield* this.decode(tlv);
    }
  }

  private *decode(tlv: Decoder.Tlv): Iterable<Decoder.Tlv> {
    const { type, decoder } = tlv;
    if (type !== TT.LpPacket) {
      return yield tlv;
    }

    let lpp;
    try {
      lpp = decoder.decode(LpPacket);
    } catch {
      return;
    }
    if (lpp.fragment) {
      yield new Decoder(lpp.fragment).read();
    }
  }
}
