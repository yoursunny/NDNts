import { Name, TT as l3TT } from "@ndn/packet";
import { type Decoder, type EncodableTlv, type Encoder, EvDecoder, NNI } from "@ndn/tlv";
import { fromHex, KeyMap } from "@ndn/util";

import { TT } from "./an";

const evdContext = new WeakMap<NodeMap, StateVector.ID>();

const EVD = new EvDecoder<NodeMap>("StateVector", TT.StateVector)
  .add(TT.StateVectorEntry,
    new EvDecoder<NodeMap>("StateVectorEntry")
      .add(l3TT.Name, (t, { decoder }) => {
        evdContext.set(t, { name: decoder.decode(Name), boot: -1 });
      }, { required: true })
      .add(TT.SeqNo, (t, { nni }) => {
        t.set(makeIDImpl(evdContext.get(t)!), { seqNum: nni, lastUpdate: 0 });
      })
      .add(TT.SeqNoEntry,
        new EvDecoder<NodeMap>("SeqNoEntry")
          .add(TT.BootstrapTime, (t, { nni }) => {
            evdContext.get(t)!.boot = nni;
          }, { required: true })
          .add(TT.SeqNo3, (t, { nni }) => {
            t.set(makeIDImpl(evdContext.get(t)!), { seqNum: nni, lastUpdate: 0 });
          }, { required: true }),
        { repeat: true })
      .setIsCritical(EvDecoder.alwaysCritical),
    { repeat: true })
  .setIsCritical(EvDecoder.alwaysCritical);

/** SVS state vector. */
export class StateVector {
  /**
   * Constructor.
   * @param from - Copy from state vector or its JSON value.
   */
  constructor(from?: StateVector | Record<string, number>);

  /** @internal */
  constructor(from: NodeMap);

  constructor(from?: StateVector | Record<string, number> | NodeMap) {
    if (from instanceof NodeMap) {
      this.m = from;
      return;
    }

    this.m = new NodeMap();
    if (from instanceof StateVector) {
      for (const [id, seqNum] of from) {
        this.m.set(id, { seqNum, lastUpdate: 0 });
      }
    } else if (from !== undefined) {
      for (const [idStr, seqNum] of Object.entries(from)) {
        const [nameHex, bootStr = "-1"] = idStr.split(":");
        this.m.set(
          new IDImpl(new Name(fromHex(nameHex!)), Number.parseInt(bootStr, 10)),
          { seqNum, lastUpdate: 0 },
        );
      }
    }
  }

  private readonly m: NodeMap;

  /**
   * Get node sequence number.
   * @param id - Name (SVS v2) or Name+bootstrapTime (SVS v3).
   *
   * @remarks
   * If the node does not exist, returns zero.
   */
  public get(id: Name | StateVector.ID): number {
    return this.getEntry(id).seqNum;
  }

  /**
   * Get node entry.
   * @param id - Name (SVS v2) or Name+bootstrapTime (SVS v3).
   *
   * @remarks
   * If the node does not exist, returns an entry with seqNum=0.
   */
  public getEntry(id: Name | StateVector.ID): StateVector.NodeEntry {
    return this.m.get(id) ?? { seqNum: 0, lastUpdate: 0 };
  }

  /**
   * Set node sequence number or entry.
   * @param id - Name (SVS v2) or Name+bootstrapTime (SVS v3).
   * @param entry -
   * If specified as number, it's interpreted as sequence number, and `performance.now()` is used
   * as lastUpdate. Otherwise, it's used as the node entry.
   *
   * @remarks
   * Setting sequence number to zero removes the node.
   */
  public set(id: Name | StateVector.ID, entry: number | StateVector.NodeEntry): void {
    entry = typeof entry === "number" ? { seqNum: entry, lastUpdate: performance.now() } : entry;
    if (entry.seqNum <= 0) {
      this.m.delete(id);
    } else {
      this.m.set(makeIDImpl(id), entry);
    }
  }

  /** Iterate over nodes and their sequence numbers. */
  public *[Symbol.iterator](): IterableIterator<[id: Name & StateVector.ID, seqNum: number]> {
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
  public mergeFrom(other: StateVector, lastUpdate = performance.now()): void {
    for (const { id, hiSeqNum } of this.iterOlderThan(other)) {
      this.set(id, { seqNum: hiSeqNum, lastUpdate });
    }
  }

  /** Serialize as JSON. */
  public toJSON(): Record<string, number> {
    const o: Record<string, number> = {};
    for (const [id, seqNum] of this) {
      o[mapKeyOf(id)] = seqNum;
    }
    return o;
  }

  /** Encode StateVector TLV. */
  public encodeTo(encoder: Encoder, version: 2 | 3 = 2): void {
    const list = Array.from(this);
    list.sort(([a], [b]) => -(a.name.compare(b.name) || a.boot - b.boot));
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

  private svs3EncodeValue(encoder: Encoder, list: ReadonlyArray<[id: StateVector.ID, seqNum: number]>): void {
    let seqNoEntries: EncodableTlv[] = [];
    for (const [i, [{ name, boot }, seqNum]] of list.entries()) {
      seqNoEntries.unshift([
        TT.SeqNoEntry,
        [TT.BootstrapTime, NNI(boot)],
        [TT.SeqNo3, NNI(seqNum)],
      ]);

      const prevEntry = list[i + 1];
      if (prevEntry?.[0].name.equals(name)) {
        continue;
      }

      encoder.prependTlv(TT.StateVectorEntry, name, ...seqNoEntries);
      seqNoEntries = [];
    }
  }

  /** Decode StateVector TLV. */
  public static decodeFrom(decoder: Decoder): StateVector {
    return new StateVector(EVD.decode(new NodeMap(), decoder)); // eslint-disable-line etc/no-internal
  }
}

export namespace StateVector {
  /** Node identifier. */
  export interface ID {
    /** Node prefix. */
    name: Name;

    /**
     * Node bootstrap timestamp, seconds since Unix epoch (SVS v3).
     *
     * This field shall be set to -1 for SVS v2 nodes.
     * @experimental
     */
    boot: number;
  }

  /** Per-node entry. */
  export interface NodeEntry {
    /** Current sequence number (positive integer). */
    seqNum: number;

    /** Last update timestamp (from `performance.now()`). */
    lastUpdate: number;
  }

  /** Result of {@link StateVector.listOlderThan}. */
  export interface DiffEntry {
    /** Node ID. */
    id: Name & ID;

    /** Low sequence number (inclusive). */
    loSeqNum: number;

    /** High sequence number (inclusive). */
    hiSeqNum: number;
  }
}

export class IDImpl extends Name implements StateVector.ID {
  constructor(name: Name, public readonly boot = -1) {
    super(name);
  }

  public get name(): Name {
    return this;
  }
}

export function makeIDImpl(input: Name | StateVector.ID): IDImpl {
  if (input instanceof IDImpl) {
    return input;
  }
  if ("boot" in input) {
    return new IDImpl(input.name, input.boot);
  }
  return new IDImpl(input);
}

function mapKeyOf(id: Name | StateVector.ID): string {
  return "boot" in id ? `${id.name.valueHex}:${id.boot}` : `${id.valueHex}:-1`;
}

class NodeMap extends KeyMap<IDImpl, StateVector.NodeEntry, string, Parameters<typeof mapKeyOf>[0]> {
  constructor() {
    super(mapKeyOf);
  }
}
