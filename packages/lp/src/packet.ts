import { NackHeader } from "@ndn/packet";
import { type Decoder, type Encodable, Encoder, EvDecoder, NNI } from "@ndn/tlv";
import { assert } from "@ndn/util";

import { TT } from "./an";

function isCritical(tt: number): boolean {
  return !(tt >= 800 && tt <= 959 && tt % 4 === 0);
}

const EVD = new EvDecoder<LpPacket>("LpPacket", TT.LpPacket)
  .add(TT.LpSeqNum, (t, { nniBig }) => t.fragSeqNum = nniBig)
  .add(TT.FragIndex, (t, { nni }) => t.fragIndex = nni)
  .add(TT.FragCount, (t, { nni }) => t.fragCount = nni)
  .add(TT.PitToken, (t, { value }) => t.pitToken = value)
  .add(TT.Nack, (t, { decoder }) => t.nack = decoder.decode(NackHeader))
  .add(TT.CongestionMark, (t, { nni }) => t.congestionMark = nni)
  .add(TT.LpPayload, (t, { value }) => t.payload = value)
  .setIsCritical(isCritical);

/** NDNLPv2 packet. */
export class LpPacket {
  public static decodeFrom(decoder: Decoder): LpPacket {
    return EVD.decode(new LpPacket(), decoder);
  }

  public fragSeqNum?: bigint;
  public fragIndex = 0;
  public fragCount = 1;

  /**
   * L3 payload.
   *
   * @remarks
   * This field may contain either a whole L3 packet or fragment of one.
   * This is also known as *fragment* in other libraries.
   */
  public payload?: Uint8Array;

  /**
   * Extract L3 fields only.
   *
   * @remarks
   * They may be copied to another LpPacket via `Object.assign()`.
   */
  public get l3(): LpL3 {
    const t: LpL3 = {};
    for (const k of ["pitToken", "nack", "congestionMark"] satisfies ReadonlyArray<keyof LpL3>) {
      t[k] = this[k] as any;
    }
    return t;
  }

  /**
   * Prepend LpPacket to encoder.
   *
   * @throws Error
   * Thrown if fragmentation headers violate invariants:
   * - `.fragIndex >= .fragCount`
   * - `.fragSeqNum` is unset but `.fragCount > 1`
   */
  public encodeTo(encoder: Encoder): void {
    encoder.prependTlv(TT.LpPacket,
      ...this.encodeFragHeaders(),
      ...this.encodeL3Headers(),
      [TT.LpPayload, Encoder.OmitEmpty, this.payload],
    );
  }

  private encodeFragHeaders(): Encodable[] {
    assert(this.fragIndex < this.fragCount);
    if (this.fragSeqNum === undefined) {
      assert(this.fragCount === 1);
      return [];
    }
    return [
      [TT.LpSeqNum, NNI(this.fragSeqNum, { len: 8 })],
      this.fragIndex > 0 && [TT.FragIndex, NNI(this.fragIndex)],
      this.fragCount > 1 && [TT.FragCount, NNI(this.fragCount)],
    ];
  }

  /**
   * Determine whether any L3 header is present.
   * @see {@link LpL3}
   */
  public hasL3Headers(): boolean {
    const { congestionMark = 0 } = this;
    return !!this.pitToken || !!this.nack || congestionMark > 0;
  }

  /**
   * Encode L3 headers.
   * @see {@link LpL3}
   */
  public encodeL3Headers(): Encodable[] {
    const { congestionMark = 0 } = this;
    return [
      [TT.PitToken, Encoder.OmitEmpty, this.pitToken],
      this.nack,
      congestionMark > 0 && [TT.CongestionMark, NNI(congestionMark)],
    ];
  }
}
export interface LpPacket extends LpL3 {}

/** L3 fields in {@link LpPacket}. */
export interface LpL3 {
  pitToken?: Uint8Array;
  nack?: NackHeader;
  congestionMark?: number;
}
