import { PrivateKey } from "@ndn/keychain";
import { Data, Interest } from "@ndn/packet";
import { Decoder, Encoder, EvDecoder, NNI, toUtf8 } from "@ndn/tlv";

import { ErrorCode, TT } from "./an";

export interface ErrorMsg {
  errorCode: number;
  errorInfo: string;
}

const EVD = new EvDecoder<ErrorMsg>("ErrorMsg", undefined)
  .add(TT.ErrorCode, (t, { nni }) => t.errorCode = nni, { required: true })
  .add(TT.ErrorInfo, (t, { text }) => t.errorInfo = text, { required: true });

export namespace ErrorMsg {
  export async function makeData(errorCode: ErrorCode, { name }: Interest, signer: PrivateKey) {
    const errorInfo = ErrorCode[errorCode];
    const payload = Encoder.encode([
      [TT.ErrorCode, NNI(errorCode)],
      [TT.ErrorInfo, toUtf8(errorInfo)],
    ]);

    const data = new Data();
    data.name = name;
    data.freshnessPeriod = 1;
    data.content = payload;
    await signer.sign(data);
    return data;
  }

  export function fromData({ content }: Data): ErrorMsg {
    return EVD.decodeValue({} as ErrorMsg, new Decoder(content));
  }

  export function throwOnError(data: Data) {
    let e: ErrorMsg|undefined;
    try { e = fromData(data); } catch { return; }
    throw new Error(`CA response error ${e.errorCode}: ${e.errorInfo}`);
  }
}
