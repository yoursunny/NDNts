import { type Decoder, type Encodable, Encoder, EvDecoder, NNI } from "@ndn/tlv";
import { toUtf8 } from "@ndn/util";

const enum TT {
  ControlResponse = 0x65,
  StatusCode = 0x66,
  StatusText = 0x67,
}

const EVD = new EvDecoder<ControlResponse>("ControlResponse", TT.ControlResponse)
  .add(TT.StatusCode, (t, { nni }) => t.statusCode = nni)
  .add(TT.StatusText, (t, { text, after }) => {
    t.statusText = text;
    t.body = after;
  })
  .setIsCritical(EvDecoder.neverCritical);

/** NFD Management ControlResponse struct. */
export class ControlResponse {
  public static decodeFrom(decoder: Decoder): ControlResponse {
    return EVD.decode(new ControlResponse(), decoder);
  }

  /**
   * Constructor.
   * @param statusCode - Command status code.
   * @param statusText - Command status text.
   * @param body - Additional elements in the response.
   */
  constructor(public statusCode = 0, public statusText = "", body?: Encodable) {
    this.body_ = body;
  }

  private body_: Encodable;

  /**
   * Additional elements in the response.
   *
   * @remarks
   * For most NFD control commands, this is {@link ControlParameters}.
   * It can be decoded with:
   * ```ts
   * ControlParameters.decodeFromResponseBody(response);
   * ```
   */
  public get body(): Uint8Array {
    return ArrayBuffer.isView(this.body_) ? this.body_ : Encoder.encode(this.body_);
  }

  public set body(value: Encodable) {
    this.body_ = value;
  }

  public encodeTo(encoder: Encoder): void {
    encoder.prependTlv(
      TT.ControlResponse,
      [TT.StatusCode, NNI(this.statusCode)],
      [TT.StatusText, toUtf8(this.statusText)],
      this.body_,
    );
  }
}
