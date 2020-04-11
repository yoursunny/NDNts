import { Decoder, EvDecoder } from "@ndn/tlv";

const textDecoder = new TextDecoder(); // https://github.com/nodejs/node/issues/32424 workaround

const EVD = new EvDecoder<ControlResponse>("ControlResponse", 0x65)
  .add(0x66, (t, { nni }) => t.statusCode = nni)
  .add(0x67, (t, { value }) => t.statusText = textDecoder.decode(value))
  .setIsCritical(() => false);

/** NFD Management ControlResponse struct (decoding only). */
export class ControlResponse {
  public static decodeFrom(decoder: Decoder): ControlResponse {
    return EVD.decode(new ControlResponse(), decoder);
  }

  public statusCode = 0;
  public statusText = "";
}
