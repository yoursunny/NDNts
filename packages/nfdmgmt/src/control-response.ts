import { type Decoder, type Encodable, type Encoder, EvDecoder, NNI } from "@ndn/tlv";
import { toUtf8 } from "@ndn/util";

const TT = {
  ControlResponse: 0x65,
  StatusCode: 0x66,
  StatusText: 0x67,
};

const EVD = new EvDecoder<ControlResponse>("ControlResponse", TT.ControlResponse)
  .add(TT.StatusCode, (t, { nni }) => t.statusCode = nni)
  .add(TT.StatusText, (t, { text, after }) => {
    t.statusText = text;
    t.body = after;
  })
  .setIsCritical(() => false);

/** NFD Management ControlResponse struct (decoding only). */
export class ControlResponse {
  public static decodeFrom(decoder: Decoder): ControlResponse {
    return EVD.decode(new ControlResponse(), decoder);
  }

  public constructor(public statusCode = 0, public statusText = "", public body?: Encodable) {}

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(
      TT.ControlResponse,
      [TT.StatusCode, NNI(this.statusCode)],
      [TT.StatusText, toUtf8(this.statusText)],
      this.body,
    );
  }
}
