import { Component, Name, TT as l3TT } from "@ndn/packet";
import { type Decoder, Encoder, EvDecoder } from "@ndn/tlv";

export const MsgSuffix = Component.from("msg");
export const NotifySuffix = Component.from("notify");

const TT = {
  NotifyNonce: 0x80,
  PublisherFwHint: 0xD3,
} as const;

const EVD = new EvDecoder<NotifyParams>("NotifyParams")
  .add(l3TT.Name, (t, { decoder }) => t.publisher = decoder.decode(Name))
  .add(TT.NotifyNonce, (t, { value }) => t.nonce = value)
  .add(TT.PublisherFwHint, (t, { vd }) => t.publisherFwHint = vd.decode(Name));

export class NotifyParams {
  public static decodeFrom(decoder: Decoder): NotifyParams {
    return EVD.decodeValue(new NotifyParams(new Name(), new Uint8Array()), decoder);
  }

  constructor(
      public publisher: Name,
      public nonce: Uint8Array,
      public publisherFwHint?: Name,
  ) {}

  public encodeTo(encoder: Encoder) {
    encoder.prependValue(
      this.publisher,
      [TT.NotifyNonce, this.nonce],
      [TT.PublisherFwHint, Encoder.OmitEmpty, this.publisherFwHint],
    );
  }
}
