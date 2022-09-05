import { Component, Name } from "@ndn/packet";
import { type Decoder, Encoder, NNI } from "@ndn/tlv";

export const InsertVerb = Component.from("insert");
export const DeleteVerb = Component.from("delete");
export const CheckVerb = Component.from("check");

const TT = {
  StartBlockId: 0xCC,
  EndBlockId: 0xCD,
  ProcessId: 0xCE,
  StatusCode: 0xD0,
  InsertNum: 0xD1,
  DeleteNum: 0xD2,
  ForwardingHint: 0xD3,
  RegisterPrefix: 0xD4,
  CheckPrefix: 0xD5,
};

export class CommandParameter {
  constructor(
      public name?: Name,
      public startBlockId?: number,
      public endBlockId?: number,
  ) {}

  public processId = new Uint8Array();
  public fwHint?: Name;
  public checkPrefix = new Name();

  public encodeTo(encoder: Encoder) {
    encoder.prependValue(
      this.name,
      [TT.ForwardingHint, Encoder.OmitEmpty, this.fwHint],
      this.startBlockId !== undefined && [TT.StartBlockId, NNI(this.startBlockId)],
      this.endBlockId !== undefined && [TT.EndBlockId, NNI(this.endBlockId)],
      [TT.ProcessId, this.processId],
      // [TT.RegisterPrefix],
      [TT.CheckPrefix, this.checkPrefix],
    );
  }
}

export class CommandResponse {
  public static decodeFrom(decoder: Decoder): CommandResponse {
    const t = new CommandResponse();
    while (!decoder.eof) {
      const { type, nni } = decoder.read();
      if (type === TT.StatusCode) {
        t.statusCode = nni;
      }
    }
    return t;
  }

  public statusCode = 0;
}
