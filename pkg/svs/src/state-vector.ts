import { Component, Name, NameMap } from "@ndn/packet";
import { Decoder, Encoder, NNI } from "@ndn/tlv";
import { fromHex } from "@ndn/util";

import { TT } from "./an";

/** SVS state vector. */
export class StateVector {
  /**
   * Constructor.
   * @param from - Copy from state vector or its JSON value.
   * @param lastUpdate - Initial lastUpdate value for each node entry.
   */
  constructor(from?: StateVector | Record<string, number>, lastUpdate = 0) {
    if (from instanceof StateVector) {
      for (const [id, seqNum] of from) {
        this.m.set(id, { seqNum, lastUpdate });
      }
    } else if (from !== undefined) {
      for (const [idHex, entry] of Object.entries(from)) {
        this.m.set(new Name(fromHex(idHex)), toNodeEntry(entry, lastUpdate));
      }
    }
  }

  private readonly m = new NameMap<StateVector.NodeEntry>();

  /**
   * Get node sequence number.
   *
   * @remarks
   * If the node does not exist, returns zero.
   */
  public get(id: Name): number {
    return this.getEntry(id).seqNum;
  }

  /**
   * Get node entry.
   *
   * @remarks
   * If the node does not exist, returns an entry with seqNum=0.
   */
  public getEntry(id: Name): StateVector.NodeEntry {
    return this.m.get(id) ?? { seqNum: 0, lastUpdate: 0 };
  }

  /**
   * Set node sequence number or entry.
   * @param entry -
   * If specified as number, it's interpreted as sequence number, and `Date.now()` is used as
   * lastUpdate. Otherwise, it's used as the node entry.
   *
   * @remarks
   * Setting sequence number to zero removes the node.
   */
  public set(id: Name, entry: number | StateVector.NodeEntry): void {
    entry = toNodeEntry(entry);
    if (entry.seqNum <= 0) {
      this.m.delete(id);
    } else {
      this.m.set(id, entry);
    }
  }

  /** Iterate over nodes and their sequence numbers. */
  public *[Symbol.iterator](): IterableIterator<[id: Name, seqNum: number]> {
    for (const [id, { seqNum }] of this.m) {
      yield [id, seqNum];
    }
  }

  private *iterOlderThan(other: StateVector): Iterable<StateVector.DiffEntry> {
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
  public listOlderThan(other: StateVector): StateVector.DiffEntry[] {
    return Array.from(this.iterOlderThan(other));
  }

  /** Update this state vector to have newer sequence numbers between this and other. */
  public mergeFrom(other: StateVector, lastUpdate = Date.now()): void {
    for (const { id, hiSeqNum } of this.iterOlderThan(other)) {
      this.set(id, { seqNum: hiSeqNum, lastUpdate });
    }
  }

  /** Serialize as JSON. */
  public toJSON(): Record<string, number> {
    const o: Record<string, number> = {};
    for (const [id, seqNum] of this) {
      o[id.valueHex] = seqNum;
    }
    return o;
  }

  /** Encode TLV-VALUE only. */
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

  /**
   * Encode to name component.
   * @deprecated No longer supported.
   */
  public toComponent(): Component {
    return new Component(TT.StateVector, Encoder.encode(this));
  }

  /** Decode TLV-VALUE only. */
  public static decodeFrom(decoder: Decoder): StateVector {
    const vv = new StateVector();
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

  /**
   * Decode from name component.
   * @deprecated No longer supported.
   */
  public static fromComponent(comp: Component): StateVector {
    if (comp.type !== TT.StateVector) {
      throw new Error("unexpected NameComponent TLV-TYPE");
    }
    return StateVector.decodeFrom(new Decoder(comp.value));
  }
}

export namespace StateVector {
  /**
   * StateVector TLV-TYPE.
   *
   * @remarks
   * SVS v1 encodes StateVector as a name component of this type.
   * SVS v2 encodes StateVector as a sub-element of this type within AppParameters.
   */
  export const Type = TT.StateVector;

  /**
   * TLV-TYPE of name component.
   * @deprecated Use {@link Type}.
   */
  export const NameComponentType = TT.StateVector;

  /** Per-node entry. */
  export interface NodeEntry {
    /** Current sequence number (positive integer). */
    seqNum: number;

    /** Last update timestamp (from `Date.now()`). */
    lastUpdate: number;
  }

  /** Result of {@link StateVector.listOlderThan}. */
  export interface DiffEntry {
    /** Node ID. */
    id: Name;

    /** Low sequence number (inclusive). */
    loSeqNum: number;

    /** High sequence number (inclusive). */
    hiSeqNum: number;
  }
}

function toNodeEntry(entry: number | StateVector.NodeEntry, lastUpdate = Date.now()): StateVector.NodeEntry {
  if (typeof entry === "number") {
    entry = { seqNum: entry, lastUpdate };
  }
  entry.seqNum = Math.trunc(entry.seqNum);
  return entry;
}
