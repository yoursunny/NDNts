import { Decoder, EncodableObj, Encoder, EvDecoder, Extensible, ExtensionRegistry, NNI } from "@ndn/tlv";

import { TT } from "./an";
import { KeyLocator } from "./key-locator";

const EXTENSIONS = new ExtensionRegistry<SigInfo>();

const EVD = new EvDecoder<SigInfo>("SigInfo", [TT.ISigInfo, TT.DSigInfo])
  .add(TT.SigType, (t, { nni }) => t.type = nni, { required: true })
  .add(TT.KeyLocator, (t, { decoder }) => t.keyLocator = decoder.decode(KeyLocator))
  .add(TT.SigNonce, (t, { value }) => t.nonce = NNI.decode(value, { len: 4 }))
  .add(TT.SigTime, (t, { nni }) => t.time = nni)
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
  public time?: number;
  public seqNum?: number;
  public [Extensible.TAG] = Extensible.newRecords();

  /**
   * Construct from flexible arguments.
   *
   * Arguments can include, in any order:
   * - SigInfo to copy from
   * - number as SigType
   * - KeyLocator, or Name/URI/KeyDigest to construct KeyLocator
   * - Nonce, Time, SeqNum
   */
  constructor(...args: SigInfo.CtorArg[]) {
    const klArgs: KeyLocator.CtorArg[] = [];
    for (const arg of args) {
      if (typeof arg === "number") {
        this.type = arg;
      } else if (KeyLocator.isCtorArg(arg)) {
        klArgs.push(arg);
      } else if (arg instanceof NonceTag) {
        this.nonce = arg.v;
      } else if (arg instanceof TimeTag) {
        this.time = arg.v;
      } else if (arg instanceof SeqNumTag) {
        this.seqNum = arg.v;
      } else if (arg instanceof SigInfo) {
        Object.assign(this, arg);
        this[Extensible.TAG] = { ...arg[Extensible.TAG] };
      } else {
        throw new Error("unknown SigInfo constructor argument");
      }
    }
    if (klArgs.length > 0) {
      this.keyLocator = new KeyLocator(...klArgs);
    }
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
      this.keyLocator,
      [TT.SigNonce, Encoder.OmitEmpty,
        typeof this.nonce === "undefined" ? undefined : NNI(this.nonce, { len: 4 })],
      [TT.SigTime, Encoder.OmitEmpty,
        typeof this.time === "undefined" ? undefined : NNI(this.time)],
      [TT.SigSeqNum, Encoder.OmitEmpty,
        typeof this.seqNum === "undefined" ? undefined : NNI(this.seqNum)],
      ...EXTENSIONS.encode(this),
    );
  }
}

class NonceTag {
  constructor(public v: number) {
  }
}

class TimeTag {
  constructor(public v: number) {
  }
}

class SeqNumTag {
  constructor(public v: number) {
  }
}

export namespace SigInfo {
  export function Nonce(v = generateNonce()): NonceTag {
    return new NonceTag(v);
  }

  /** Generate a random nonce. */
  export function generateNonce(): number {
    return Math.floor(Math.random() * 0x100000000);
  }

  export function Time(v = Date.now()): TimeTag {
    return new TimeTag(v);
  }

  export function SeqNum(v: number): SeqNumTag {
    return new SeqNumTag(v);
  }

  export type CtorArg = SigInfo | number | KeyLocator.CtorArg | NonceTag | TimeTag | SeqNumTag;

  export const registerExtension = EXTENSIONS.registerExtension;
  export const unregisterExtension = EXTENSIONS.unregisterExtension;
}
