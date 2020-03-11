import { Decoder, Encoder, EvDecoder, NNI } from "@ndn/tlv";

import { NackReason } from "./an";
import { Interest, TT } from "./mod";

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
    encoder.prependTlv(TT.Nack,
      [TT.NackReason, Encoder.OmitEmpty,
        this.reason_ > 0 ? NNI(this.reason_) : undefined],
    );
  }
}

/** Nack packet. */
export class Nack {
  public get reason() { return this.header.reason; }
  public set reason(v) { this.header.reason = v; }

  public header: NackHeader;
  public interest: Interest;

  constructor(interest: Interest, header: NackHeader|number = NackReason.NoRoute) {
    this.interest = interest;
    if (typeof header === "number") {
      this.header = new NackHeader(header);
    } else {
      this.header = header;
    }
  }
}
