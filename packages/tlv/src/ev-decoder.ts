import printf = require("printf");
import { Decoder } from "./decoder";

function isCritical(tt: number): boolean {
  return tt <= 0x1F || tt % 2 === 1;
}

/**
 * TLV-VALUE decoder with Packet Format v0.3 evolvability support.
 */
export class EvDecoder<T> {
  private ttIndex: {[tt: number]: number};

  constructor(private tlvType: number, private rules: Array<EvDecoder.Rule<T>>) {
    this.ttIndex = Object.fromEntries(this.rules.map((rule, i) => [rule.tt, i]));
  }

  public decode(target: T, decoder: Decoder) {
    decoder.readTypeExpect(this.tlvType);
    const vd = decoder.createValueDecoder();
    let currentIndex = 0;
    let currentOccurs = 0;
    while (!vd.eof) {
      const tlv = vd.readTlv();
      const tt = tlv.type;
      const i: number|undefined = this.ttIndex[tt];
      if (typeof i === "undefined") {
        this.handleUnrecognized(tt, "unknown");
        continue;
      }
      const rule = this.rules[i];

      if (currentIndex > i) {
        this.handleUnrecognized(tt, "out of order");
        continue;
      }

      if (currentIndex < i) {
        currentIndex = i;
        currentOccurs = 0;
      }
      ++currentOccurs;
      if (!rule.repeatable && currentOccurs > 1) {
        throw new Error(printf("TLV-TYPE %02X cannot repeat in %02X",
                               tt, this.tlvType));
      }

      rule.cb(target, tlv);
    }
  }

  private handleUnrecognized(tt: number, reason: string) {
    if (!isCritical(tt)) {
      return;
    }
    throw new Error(printf("TLV-TYPE %02X is %s in %02X", tt, reason, this.tlvType));
  }
}

export namespace EvDecoder {
  export interface Rule<T> {
    tt: number;
    cb: (target: T, tlv: Decoder.Tlv) => any;
    repeatable?: boolean;
  }
}
