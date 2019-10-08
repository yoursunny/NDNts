import { Name, NameLike } from "@ndn/name";
import { Decoder, EncodableObj, Encoder, EvDecoder, Extensible, ExtensionRegistry, NNI } from "@ndn/tlv";

import { TT } from "./an";

export class KeyDigest {
  constructor(public readonly value: Uint8Array) {
  }

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(TT.KeyDigest, this.value);
  }
}

export type KeyLocator = Name|KeyDigest;

const EXTENSIONS = new ExtensionRegistry<SigInfo>();

const EVD = new EvDecoder<SigInfo>("SigInfo", [TT.ISigInfo, TT.DSigInfo])
.add(TT.SigType, (t, { nni }) => t.type = nni)
.add(TT.KeyLocator,
  new EvDecoder<SigInfo>("KeyLocator")
  .add(TT.Name, (t, { decoder }) => t.keyLocator = decoder.decode(Name), { order: 0 })
  .add(TT.KeyDigest, (t, { value }) => t.keyLocator = new KeyDigest(value), { order: 0 }),
)
.add(TT.SigNonce, (t, { value }) => t.nonce = NNI.decode(value, 4))
.add(TT.SigTime, (t, { nni }) => t.time = new Date(nni))
.add(TT.SigSeqNum, (t, { nni }) => t.seqNum = nni)
.setUnknown(EXTENSIONS.decodeUnknown);

/** SignatureInfo on Interest or Data. */
export class SigInfo {
  public static decodeFrom(decoder: Decoder): SigInfo {
    return EVD.decode(new SigInfo(), decoder);
  }

  public type?: number;
  public keyLocator?: KeyLocator;
  public nonce?: number;
  public time?: Date;
  public seqNum?: number;
  public [Extensible.TAG]: Extensible.Records = {};

  /**
   * Construct from flexible arguments.
   *
   * Arguments can include, in any order:
   * - SigInfo to copy from
   * - number as SigType
   * - Name or URI or KeyDigest as KeyLocator
   */
  constructor(...args: Array<SigInfo | SigInfo.CtorArg>) {
    args.forEach((arg) => {
      if (typeof arg === "number") {
        this.type = arg;
      } else if (Name.isNameLike(arg)) {
        this.keyLocator = new Name(arg);
      } else if (arg instanceof KeyDigest) {
        this.keyLocator = arg;
      } else if (arg instanceof SigInfo) {
        Object.assign(this, arg);
        this[Extensible.TAG] = { ...arg[Extensible.TAG] };
      } else {
        throw new Error("unknown SigInfo constructor argument");
      }
    });
  }

  public encodeAs(tt: number): EncodableObj {
    return {
      encodeTo: (encoder) => this.encodeTo(encoder, tt),
    };
  }

  private encodeTo(encoder: Encoder, tt: number) {
    if (typeof this.type === "undefined") {
      throw new Error("cannot encode SigInfo without SigType");
    }

    encoder.prependTlv(tt,
      [TT.SigType, NNI(this.type)],
      [TT.KeyLocator, Encoder.OmitEmpty, this.keyLocator],
      [TT.SigNonce, Encoder.OmitEmpty,
       typeof this.nonce === "undefined" ? undefined : NNI(this.nonce, 4)],
      [TT.SigTime, Encoder.OmitEmpty,
       typeof this.time === "undefined" ? undefined : NNI(this.time.getTime())],
      [TT.SigSeqNum, Encoder.OmitEmpty,
       typeof this.seqNum === "undefined" ? undefined : NNI(this.seqNum)],
      ...EXTENSIONS.encode(this),
    );
  }
}

export namespace SigInfo {
  export type CtorArg = number | NameLike | KeyDigest;

  export const registerExtension = EXTENSIONS.registerExtension;
  export const unregisterExtension = EXTENSIONS.unregisterExtension;
}
