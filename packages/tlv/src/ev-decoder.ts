import printf = require("printf");
import { Decoder } from "./decoder";

function isCritical(tt: number): boolean {
  return tt <= 0x1F || tt % 2 === 1;
}

/** TLV-VALUE decoder that understands Packet Format v0.3 evolvability rules. */
export class EvDecoder<T> {
  private ttIndex: {[tt: number]: number};

  /**
   * Constructor.
   * @param tlvType top-level TLV-TYPE.
   * @param rules rules to decode TLV-VALUE elements, in the order of expected appearance.
   */
  constructor(private tlvType: number, private rules: Array<EvDecoder.Rule<T>>) {
    this.ttIndex = Object.fromEntries(this.rules.map((rule, i) => [rule.tt, i]));
  }

  /** Decode TLV element. */
  public decode(target: T, decoder: Decoder) {
    const { type, vd } = decoder.read();
    if (type !== this.tlvType) {
      throw new Error(printf("want TLV-TYPE %02X but got %02X", this.tlvType, type));
    }

    let currentIndex = 0;
    let currentOccurs = 0;
    while (!vd.eof) {
      const tlv = vd.read();
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

type ElementCallback<T> = (target: T, tlv: Decoder.Tlv) => any;

export namespace EvDecoder {
  /** TLV element decoding rule. */
  export interface Rule<T> {
    /** TLV-TYPE number. */
    tt: number;
    /** Callback to record TLV element. */
    cb: ElementCallback<T>;
    /** Whether this TLV-TYPE may appear more than once, default is false. */
    repeatable?: boolean;
  }

  /**
   * Use a nested EvDecoder as Rule.cb().
   *
   * Generally, T would be same as the target type of top level EvDecoder.
   */
  export function Nest<T>(evd: EvDecoder<T>): ElementCallback<T> {
    return (target, { decoder }) => { evd.decode(target, decoder); };
  }
}