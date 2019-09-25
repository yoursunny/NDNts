import { Name } from "@ndn/name";
import { Decoder, Encoder, EvDecoder, NNI } from "@ndn/tlv";

import { TT } from "./an";

export class KeyDigest {
  constructor(public readonly value: Uint8Array) {
  }

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(TT.KeyDigest, this.value);
  }
}

const EVD = new EvDecoder<SigInfo>("SigInfo", [TT.ISigInfo, TT.DSigInfo])
.add(TT.SigType, (t, { value }) => t.type = NNI.decode(value))
.add(TT.KeyLocator,
  new EvDecoder<SigInfo>("KeyLocator")
  .add(TT.Name, (t, { decoder }) => t.keyLocator = decoder.decode(Name), { order: 0 })
  .add(TT.KeyDigest, (t, { value }) => t.keyLocator = new KeyDigest(value), { order: 0 }),
)
.add(TT.SigNonce, (t, { value }) => t.nonce = NNI.decode(value, 4))
.add(TT.SigTime, (t, { value }) => t.time = new Date(NNI.decode(value)))
.add(TT.SigSeqNum, (t, { value }) => t.seqNum = NNI.decode(value));

export abstract class SigInfo {
  public type?: number;
  public keyLocator?: Name|KeyDigest;
  public nonce?: number;
  public time?: Date;
  public seqNum?: number;

  protected encodeTo(encoder: Encoder, tt: number) {
    if (typeof this.type === "undefined") {
      throw new Error("cannot encode SigInfo without SigType");
    }

    encoder.prependTlv(tt,
      [TT.SigType, NNI(this.type)],
      [TT.KeyLocator, Encoder.OmitEmpty, this.keyLocator],
      [TT.SigNonce, Encoder.OmitEmpty,
       typeof this.nonce === "undefined" ? undefined : NNI(this.nonce, 4)],
      [TT.SigTime, Encoder.OmitEmpty,
       typeof this.time === "undefined" ? undefined : NNI(this.time.getTime())],
      [TT.SigSeqNum, Encoder.OmitEmpty,
       typeof this.seqNum === "undefined" ? undefined : NNI(this.seqNum)],
    );
  }
}

/** Interest SignatureInfo. */
export class ISigInfo extends SigInfo {
  public static decodeFrom(decoder: Decoder): ISigInfo {
    return EVD.decode(new ISigInfo(), decoder);
  }

  public encodeTo(encoder: Encoder) {
    super.encodeTo(encoder, TT.ISigInfo);
  }
}

/** Data SignatureInfo. */
export class DSigInfo extends SigInfo {
  public static decodeFrom(decoder: Decoder): DSigInfo {
    return EVD.decode(new DSigInfo(), decoder);
  }

  public encodeTo(encoder: Encoder) {
    super.encodeTo(encoder, TT.DSigInfo);
  }
}
