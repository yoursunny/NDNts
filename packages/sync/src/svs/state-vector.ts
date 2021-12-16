import { Component, Name } from "@ndn/packet";
import { Decoder, Encoder, NNI, toHex } from "@ndn/tlv";

const TT = {
  StateVector: 0xC9,
  StateVectorEntry: 0xCA,
  SeqNo: 0xCC,
};

/** SVS state vector. */
export class SvStateVector {
  private readonly m = new Map<string, [id: Name, seqNum: number]>();

  /** Get sequence number of a node. */
  public get(hex: string): number {
    const tuple = this.m.get(hex);
    return tuple ? tuple[1] : 0;
  }

  /** Set sequence number of a node. */
  public set(hex: string, id: Name, seqNum: number): void {
    this.m.set(hex, [id, seqNum]);
  }

  private *iterOlderThan(other: SvStateVector): Iterable<SvStateVector.DiffEntry> {
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
  public listOlderThan(other: SvStateVector): SvStateVector.DiffEntry[] {
    return Array.from(this.iterOlderThan(other));
  }

  /** Update this version vector to have newer sequence numbers between this and other. */
  public mergeFrom(other: SvStateVector): void {
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
    for (const [, [id, seqNum]] of list) {
      encoder.prependTlv(TT.StateVectorEntry,
        id,
        [TT.SeqNo, NNI(seqNum)],
      );
    }
  }

  /** Encode to name component. */
  public toComponent(): Component {
    return new Component(TT.StateVector, Encoder.encode(this));
  }

  /** Decode TLV-VALUE of name component. */
  public static decodeFrom(decoder: Decoder): SvStateVector {
    const vv = new SvStateVector();
    while (!decoder.eof) {
      const { type: entryT, vd: d1 } = decoder.read();
      const id = d1.decode(Name);
      const { type: seqNumT, nni: seqNum } = d1.read();
      if (entryT !== TT.StateVectorEntry || seqNumT !== TT.SeqNo || !d1.eof) {
        throw new Error("invalid StateVector");
      }
      vv.set(toHex(id.value), id, seqNum);
    }
    return vv;
  }

  /** Decode from name component. */
  public static fromComponent(comp: Component): SvStateVector {
    if (comp.type !== TT.StateVector) {
      throw new Error("unexpected NameComponent TLV-TYPE");
    }
    return SvStateVector.decodeFrom(new Decoder(comp.value));
  }
}

export namespace SvStateVector {
  /** TLV-TYPE of name component. */
  export const NameComponentType = TT.StateVector;

  export interface DiffEntry {
    id: Name;
    hex: string;
    loSeqNum: number;
    hiSeqNum: number;
  }
}
