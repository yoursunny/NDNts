import { Component, Name, NameMap } from "@ndn/packet";
import { Decoder, Encoder, NNI } from "@ndn/tlv";
import { fromHex } from "@ndn/util";

import { TT } from "./an";

/** SVS state vector. */
export class SvStateVector {
  /**
   * Constructor.
   * @param from copy from state vector or its JSON value.
   */
  constructor(from?: SvStateVector | Record<string, number>) {
    if (from instanceof SvStateVector) {
      for (const [id, seqNum] of from) {
        this.m.set(id, seqNum);
      }
    } else if (from !== undefined) {
      for (const [idHex, seqNum] of Object.entries(from)) {
        this.m.set(new Name(fromHex(idHex)), seqNum);
      }
    }
  }

  private readonly m = new NameMap<number>();

  /** Get sequence number of a node. */
  public get(id: Name): number {
    return this.m.get(id) ?? 0;
  }

  /**
   * Set sequence number of a node.
   * Setting to zero removes the node.
   */
  public set(id: Name, seqNum: number): void {
    seqNum = Math.trunc(seqNum);
    if (seqNum <= 0) {
      this.m.delete(id);
    } else {
      this.m.set(id, seqNum);
    }
  }

  /** Iterate over nodes and their sequence numbers. */
  public [Symbol.iterator](): IterableIterator<[id: Name, seqNum: number]> {
    return this.m[Symbol.iterator]();
  }

  private *iterOlderThan(other: SvStateVector): Iterable<SvStateVector.DiffEntry> {
    for (const [id, otherSeqNum] of other) {
      const thisSeqNum = this.get(id);
      if (thisSeqNum < otherSeqNum) {
        yield {
          id,
          loSeqNum: thisSeqNum + 1,
          hiSeqNum: otherSeqNum,
        };
      }
    }
  }

  /** List nodes with older sequence number in this state vector than other. */
  public listOlderThan(other: SvStateVector): SvStateVector.DiffEntry[] {
    return Array.from(this.iterOlderThan(other));
  }

  /** Update this state vector to have newer sequence numbers between this and other. */
  public mergeFrom(other: SvStateVector): void {
    for (const { id, hiSeqNum } of this.iterOlderThan(other)) {
      this.set(id, hiSeqNum);
    }
  }

  public toJSON(): Record<string, number> {
    const o: Record<string, number> = {};
    for (const [id, seqNum] of this) {
      o[id.valueHex] = seqNum;
    }
    return o;
  }

  /** Encode TLV-VALUE of name component. */
  public encodeTo(encoder: Encoder): void {
    const list = Array.from(this);
    list.sort(([a], [b]) => -a.compare(b));
    for (const [id, seqNum] of list) {
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
      vv.set(id, seqNum);
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
    loSeqNum: number;
    hiSeqNum: number;
  }
}
