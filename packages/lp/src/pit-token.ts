import { Encoder } from "@ndn/tlv";

/** PIT token field of NDNLP packet. */
export type PitToken = Uint8Array;

let lastPrefix = 0;

/** PIT tokens in a 32-bit numeric range. */
export class NumericPitToken {
  constructor(public readonly prefix = ++lastPrefix) {
  }

  public toNumber(token?: PitToken): number|undefined {
    if (!token || token.byteLength !== 8) {
      return undefined;
    }

    const dv = Encoder.asDataView(token);
    if (dv.getUint32(0) !== this.prefix) {
      return undefined;
    }
    return dv.getUint32(4);
  }

  public toToken(suffix: number): PitToken {
    const token = new Uint8Array(8);
    const dv = Encoder.asDataView(token);
    dv.setUint32(0, this.prefix);
    dv.setUint32(4, suffix);
    return token;
  }
}
