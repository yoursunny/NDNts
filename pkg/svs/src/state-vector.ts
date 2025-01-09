import { Component, Name, NameMap, TT as l3TT } from "@ndn/packet";
import { type Decoder, type EncodableTlv, Encoder, EvDecoder, NNI } from "@ndn/tlv";
import { assert, fromHex } from "@ndn/util";
import bufferCompare from "buffer-compare";

import { TT } from "./an";

const evdContext = new WeakMap<NodeMap, [name: Name, bootstrapTimeTlv?: Uint8Array]>();

const EVD = new EvDecoder<NodeMap>("StateVector", TT.StateVector)
  .add(TT.StateVectorEntry,
    new EvDecoder<NodeMap>("StateVectorEntry")
      .add(l3TT.Name, (t, { decoder }) => {
        evdContext.set(t, [decoder.decode(Name)]);
      }, { required: true })
      .add(TT.SeqNo, (t, { nni }) => {
        const [name] = evdContext.get(t)!;
        t.set(name, { seqNum: nni, lastUpdate: 0 });
      })
      .add(TT.SeqNoEntry,
        new EvDecoder<NodeMap>("SeqNoEntry")
          .add(TT.BootstrapTime, (t, { tlv }) => {
            evdContext.get(t)![1] = tlv;
          }, { required: true })
          .add(TT.SeqNo3, (t, { nni }) => {
            const [name, bootstrapTimeTlv] = evdContext.get(t)!;
            t.set(name.append(new Component(bootstrapTimeTlv!)), { seqNum: nni, lastUpdate: 0 });
          }, { required: true }),
        { repeat: true })
      .setIsCritical(EvDecoder.alwaysCritical),
    { repeat: true })
  .setIsCritical(EvDecoder.alwaysCritical);

/**
 * SVS state vector.

 * For the `id` argument in various methods:
 * - For SVS v2, this is the node name.
 * - For SVS v3, this is the result of {@link StateVector.joinID}.
 */
export class StateVector {
  /**
   * Constructor.
   * @param from - Copy from state vector or its JSON value.
   * @param lastUpdate - Initial lastUpdate value for each node entry.
   */
  constructor(from?: StateVector | Record<string, number>, lastUpdate?: number);

  /** @internal */
  constructor(from: NodeMap);

  constructor(from?: StateVector | Record<string, number> | NodeMap, lastUpdate = 0) {
    if (from instanceof NodeMap) {
      this.m = from;
      return;
    }

    this.m = new NodeMap();
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

  private readonly m: NodeMap;

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

  /** Encode StateVector TLV. */
  public encodeTo(encoder: Encoder, version: 2 | 3 = 2): void {
    const list = Array.from(this);
    list.sort(([a], [b]) => -a.compare(b));
    const sizeBefore = encoder.size;
    this[`svs${version}EncodeValue`](encoder, list);
    encoder.prependTypeLength(TT.StateVector, encoder.size - sizeBefore);
  }

  private svs2EncodeValue(encoder: Encoder, list: ReadonlyArray<[id: Name, seqNum: number]>): void {
    for (const [id, seqNum] of list) {
      encoder.prependTlv(TT.StateVectorEntry,
        id,
        [TT.SeqNo, NNI(seqNum)],
      );
    }
  }

  private svs3EncodeValue(encoder: Encoder, list: ReadonlyArray<[id: Name, seqNum: number]>): void {
    let seqNoEntries: EncodableTlv[] = [];
    for (const [i, [id, seqNum]] of list.entries()) {
      const [name, bootstrapTime] = splitIDRaw(id);
      seqNoEntries.unshift([
        TT.SeqNoEntry,
        bootstrapTime,
        [TT.SeqNo3, NNI(seqNum)],
      ]);

      const prevEntry = list[i + 1];
      if (prevEntry && bufferCompare(splitIDRaw(prevEntry[0])[0], name) === 0) {
        continue;
      }

      encoder.prependTlv(TT.StateVectorEntry, [l3TT.Name, name], ...seqNoEntries);
      seqNoEntries = [];
    }
  }

  /** Decode StateVector TLV. */
  public static decodeFrom(decoder: Decoder): StateVector {
    return new StateVector(EVD.decode(new NodeMap(), decoder)); // eslint-disable-line etc/no-internal
  }
}

export namespace StateVector {
  /**
   * Join SVS v3 name and bootstrap time into logical ID.
   * @experimental
   */
  export function joinID(name: Name, bootstrapTime: number): Name {
    return name.append(new Component(
      Encoder.encode([TT.BootstrapTime, NNI(bootstrapTime)], 12),
    ));
  }

  /**
   * Split logical ID into SVS v3 name and bootstrap time.
   * @experimental
   */
  export function splitID(id: Name): [name: Name, bootstrapTime: number] {
    const [name, bootstrapTime] = splitIDRaw(id);
    return [new Name(name), NNI.decode(bootstrapTime.value)];
  }

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

function splitIDRaw(id: Name): [name: Uint8Array, bootstrapTime: Component] {
  const bootstrapTime = id.at(-1);
  assert(bootstrapTime.type === TT.BootstrapTime);
  return [id.value.subarray(0, -bootstrapTime.tlv.length), bootstrapTime];
}

function toNodeEntry(entry: number | StateVector.NodeEntry, lastUpdate = Date.now()): StateVector.NodeEntry {
  if (typeof entry === "number") {
    entry = { seqNum: entry, lastUpdate };
  }
  entry.seqNum = Math.trunc(entry.seqNum);
  return entry;
}

class NodeMap extends NameMap<StateVector.NodeEntry> {}
