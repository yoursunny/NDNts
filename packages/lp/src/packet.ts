import { NackHeader } from "@ndn/packet";
import { Decoder, Encodable, Encoder, EvDecoder, NNI } from "@ndn/tlv";

import { TT } from "./an";

function isCritical(tt: number): boolean {
  return !(tt >= 800 && tt <= 959 && tt % 4 === 0);
}

const EVD = new EvDecoder<LpPacket>("LpPacket", TT.LpPacket)
  .setIsCritical(isCritical)
  .add(TT.LpSeqNum, (t, { value }) => t.fragSeqNum = Encoder.asDataView(value).getBigUint64(0))
  .add(TT.FragIndex, (t, { nni }) => t.fragIndex = nni)
  .add(TT.FragCount, (t, { nni }) => t.fragCount = nni)
  .add(TT.PitToken, (t, { value }) => t.pitToken = value)
  .add(TT.Nack, (t, { decoder }) => t.nack = decoder.decode(NackHeader))
  .add(TT.LpPayload, (t, { value }) => t.payload = value);

/** NDNLPv2 packet. */
export class LpPacket {
  public static decodeFrom(decoder: Decoder): LpPacket {
    return EVD.decode(new LpPacket(), decoder);
  }

  public fragSeqNum?: bigint;
  public fragIndex = 0;
  public fragCount = 1;
  public pitToken?: Uint8Array;
  public nack?: NackHeader;
  public payload?: Uint8Array;

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(TT.LpPacket,
      typeof this.fragSeqNum === "undefined" ? undefined : [TT.LpSeqNum, NNI(this.fragSeqNum, { len: 8 })],
      this.fragIndex > 0 ? [TT.FragIndex, NNI(this.fragIndex)] : undefined,
      this.fragCount > 1 ? [TT.FragCount, NNI(this.fragCount)] : undefined,
      ...this.encodeL3Headers(),
      [TT.LpPayload, Encoder.OmitEmpty, this.payload],
    );
  }

  public encodeL3Headers(): Encodable[] {
    return [
      [TT.PitToken, Encoder.OmitEmpty, this.pitToken],
      this.nack,
    ];
  }

  public copyL3HeadersFrom(src: LpPacket): void {
    this.pitToken = src.pitToken;
    this.nack = src.nack;
  }
}
