import { type Decoder, Encoder, EvDecoder, NNI } from "@ndn/tlv";

import { NackReason, TT } from "./an";
import type { Interest } from "./interest";

const EVD = new EvDecoder<NackHeader>("NackHeader", TT.Nack)
  .add(TT.NackReason, (t, { nni }) => t.reason = nni);

/** Nack header. */
export class NackHeader {
  public get reason() { return this.reason_; }
  public set reason(v) { this.reason_ = NNI.constrain(v, "Reason"); }

  private reason_ = 0;

  public static decodeFrom(decoder: Decoder): NackHeader {
    return EVD.decode(new NackHeader(), decoder);
  }

  constructor(reason = 0) {
    this.reason = reason;
  }

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(TT.Nack, this.reason_ > 0 && [TT.NackReason, NNI(this.reason_)]);
  }
}

/** Nack packet. */
export class Nack {
  public get reason() { return this.header.reason; }
  public set reason(v) { this.header.reason = v; }

  public header: NackHeader;

  constructor(
      public interest: Interest,
      header: NackHeader | number = NackReason.NoRoute,
  ) {
    if (typeof header === "number") {
      this.header = new NackHeader(header);
    } else {
      this.header = header;
    }
  }
}
