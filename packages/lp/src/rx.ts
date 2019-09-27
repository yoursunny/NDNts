import { Decoder } from "@ndn/tlv";
import { Transform } from "readable-stream";

import { TT } from "./an";
import { LpPacket } from "./packet";

export class LpRx extends Transform {
  constructor() {
    super({ objectMode: true });
  }

  public _transform(tlv: Decoder.Tlv, encoding, callback: (error?: Error) => any): void {
    callback();

    const { type, decoder } = tlv;
    if (type !== TT.LpPacket) {
      this.push(tlv);
      return;
    }

    try {
      const lpp = decoder.decode(LpPacket);
      if (lpp.fragment) {
        this.push(new Decoder(lpp.fragment).read());
      }
    } catch {
      // pass the packet along
      this.push(tlv);
    }
  }
}
