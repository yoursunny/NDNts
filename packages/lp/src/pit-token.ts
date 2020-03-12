import { LpService } from "./service";

/** PIT token field of NDNLP packet. */
export type PitToken = Uint8Array;

export namespace PitToken {
  const map = new WeakMap<LpService.L3Pkt, PitToken>();

  /** Retrieve PIT token of L3 packet. */
  export function get(pkt: LpService.L3Pkt): PitToken|undefined {
    return map.get(pkt);
  }

  /** Store PIT token of L3 packet. */
  export function set(pkt: LpService.L3Pkt, token?: PitToken) {
    if (token) {
      map.set(pkt, token);
    } else {
      map.delete(pkt);
    }
  }
}

let lastPrefix = 0;

function toDataView(token: PitToken): DataView {
  return new DataView(token.buffer, token.byteOffset, token.byteLength);
}

/** PIT tokens in a 32-bit numeric range. */
export class NumericPitToken {
  constructor(public readonly prefix = ++lastPrefix) {
  }

  public get(pkt: LpService.L3Pkt): number|undefined {
    const token = PitToken.get(pkt);
    if (!token || token.byteLength !== 8) {
      return undefined;
    }

    const dv = toDataView(token);
    if (dv.getUint32(0) !== this.prefix) {
      return undefined;
    }
    return dv.getUint32(4);
  }

  public set(pkt: LpService.L3Pkt, suffix: number): number {
    const token = new Uint8Array(8);
    const dv = toDataView(token);
    dv.setUint32(0, this.prefix);
    dv.setUint32(4, suffix);
    PitToken.set(pkt, token);
    return suffix;
  }
}
