import { Component } from "@ndn/packet";
import { Decoder, Encoder, NNI, toHex } from "@ndn/tlv";

const TT = {
  VersionVector: 0xC9,
  VersionVectorKey: 0xCA,
  VersionVectorValue: 0xCB,
};

/** SVS version vector. */
export class SvVersionVector {
  private readonly m = new Map<string, [id: Uint8Array, seqNum: number]>();

  /** Get sequence number of a node. */
  public get(hex: string): number {
    const tuple = this.m.get(hex);
    return tuple ? tuple[1] : 0;
  }

  /** Set sequence number of a node. */
  public set(hex: string, id: Uint8Array, seqNum: number): void {
    this.m.set(hex, [id, seqNum]);
  }

  private *iterOlderThan(other: SvVersionVector): Iterable<SvVersionVector.DiffEntry> {
    for (const [hex, [id, otherSeqNum]] of other.m) {
      const thisSeqNum = this.get(hex);
      if (thisSeqNum < otherSeqNum) {
        yield {
          id,
          hex,
          loSeqNum: thisSeqNum + 1,
          hiSeqNum: otherSeqNum,
        };
      }
    }
  }

  /** List nodes with older sequence number in this version vector than other. */
  public listOlderThan(other: SvVersionVector): SvVersionVector.DiffEntry[] {
    return Array.from(this.iterOlderThan(other));
  }

  /** Update this version vector to have newer sequence numbers between this and other. */
  public mergeFrom(other: SvVersionVector): void {
    for (const { id, hex, hiSeqNum } of this.iterOlderThan(other)) {
      this.set(hex, id, hiSeqNum);
    }
  }

  public toJSON(): Record<string, number> {
    const o: Record<string, number> = {};
    for (const [hex, [, seqNum]] of this.m) {
      o[hex] = seqNum;
    }
    return o;
  }

  /** Encode TLV-VALUE of name component. */
  public encodeTo(encoder: Encoder): void {
    const list = Array.from(this.m);
    list.sort(([a], [b]) => -a.localeCompare(b));
    for (const [, [node, seqNum]] of list) {
      encoder.prependTlv(TT.VersionVectorValue, NNI(seqNum));
      encoder.prependTlv(TT.VersionVectorKey, node);
    }
  }

  /** Encode to name component. */
  public toComponent(): Component {
    return new Component(TT.VersionVector, Encoder.encode(this));
  }

  /** Decode TLV-VALUE of name component. */
  public static decodeFrom(decoder: Decoder): SvVersionVector {
    const vv = new SvVersionVector();
    while (!decoder.eof) {
      const nodeTlv = decoder.read();
      const seqNumTlv = decoder.read();
      if (nodeTlv.type !== TT.VersionVectorKey || seqNumTlv.type !== TT.VersionVectorValue) {
        throw new Error("unexpected TLV-TYPE in VersionVector");
      }
      vv.set(toHex(nodeTlv.value), nodeTlv.value, seqNumTlv.nni);
    }
    return vv;
  }

  /** Decode from name component. */
  public static fromComponent(comp: Component): SvVersionVector {
    if (comp.type !== TT.VersionVector) {
      throw new Error("unexpected NameComponent TLV-TYPE");
    }
    return SvVersionVector.decodeFrom(new Decoder(comp.value));
  }
}

export namespace SvVersionVector {
  /** TLV-TYPE of name component. */
  export const NameComponentType = TT.VersionVector;

  export interface DiffEntry {
    id: Uint8Array;
    hex: string;
    loSeqNum: number;
    hiSeqNum: number;
  }
}
