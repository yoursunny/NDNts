import { Component, Name } from "@ndn/packet";
import { Encoder, NNI } from "@ndn/tlv";

export interface Verb {
  notifySuffix: Component[];
  checkSuffix: Component[];
}

export const InsertVerb: Verb = {
  notifySuffix: [Component.from("insert"), Component.from("notify")],
  checkSuffix: [Component.from("insert%20check")],
};

export const DeleteVerb: Verb = {
  notifySuffix: [Component.from("delete"), Component.from("notify")],
  checkSuffix: [Component.from("delete%20check")],
};

export const MsgSuffix = Component.from("msg");

const TT = {
  StartBlockId: 0xCC,
  EndBlockId: 0xCD,
  ProcessId: 0xCE,
  StatusCode: 0xD0,
  InsertNum: 0xD1,
  DeleteNum: 0xD2,
  ForwardingHint: 0xD3,
  RegisterPrefix: 0xD4,
  NotifyNonce: 0x80,
};

export class NotifyParams {
  constructor(
      public publisher: Name,
      public nonce: number,
  ) {
  }

  public encodeTo(encoder: Encoder) {
    encoder.prependValue(
      this.publisher,
      [TT.NotifyNonce, NNI(this.nonce)],
    );
  }
}

export class CommandParameter {
  constructor(
      public name?: Name,
      public startBlockId?: number,
      public endBlockId?: number,
  ) {
  }

  public processId = 0;
  public forwardingHint?: Name;

  public encodeTo(encoder: Encoder) {
    encoder.prependValue(
      this.name,
      [TT.ForwardingHint, Encoder.OmitEmpty, this.forwardingHint],
      typeof this.startBlockId === "number" ? [TT.StartBlockId, NNI(this.startBlockId)] : undefined,
      typeof this.endBlockId === "number" ? [TT.EndBlockId, NNI(this.endBlockId)] : undefined,
      [TT.ProcessId, NNI(this.processId)],
      [TT.RegisterPrefix],
    );
  }
}
