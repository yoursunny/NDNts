import { type Decoder, type Encodable, Encoder, EvDecoder, NNI } from "@ndn/tlv";
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

/** NFD Management ControlResponse struct. */
export class ControlResponse {
  public static decodeFrom(decoder: Decoder): ControlResponse {
    return EVD.decode(new ControlResponse(), decoder);
  }

  /**
   * Constructor.
   * @param statusCode command status code.
   * @param statusText command status text.
   * @param body additional elements in the response.
   */
  constructor(public statusCode = 0, public statusText = "", body?: Encodable) {
    this.body_ = body;
  }

  private body_: Encodable;

  /**
   * Additional elements in the response.
   * For most NFD control commands, this is ControlParameters, and can be decoded like:
   *   ControlParameters.decodeFromResponseBody(response);
   */
  public get body(): Uint8Array {
    return Encoder.encode(this.body_);
  }

  public set body(value: Encodable) {
    this.body_ = value;
  }

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(
      TT.ControlResponse,
      [TT.StatusCode, NNI(this.statusCode)],
      [TT.StatusText, toUtf8(this.statusText)],
      this.body_,
    );
  }
}
