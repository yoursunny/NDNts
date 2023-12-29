import { type Decoder, type EncodableObj, Encoder, EvDecoder, Extensible, ExtensionRegistry, NNI } from "@ndn/tlv";
import { assert, crypto } from "@ndn/util";

import { SigType, TT } from "./an";
import { KeyLocator } from "./key-locator";

const EXTENSIONS: ExtensionRegistry<SigInfo> = new ExtensionRegistry<SigInfo>();

const EVD = new EvDecoder<SigInfo>("SigInfo", [TT.ISigInfo, TT.DSigInfo])
  .add(TT.SigType, (t, { nni }) => t.type = nni, { required: true })
  .add(TT.KeyLocator, (t, { decoder }) => t.keyLocator = decoder.decode(KeyLocator))
  .add(TT.SigNonce, (t, { value }) => t.nonce = value)
  .add(TT.SigTime, (t, { nni }) => t.time = nni)
  .add(TT.SigSeqNum, (t, { nniBig }) => t.seqNum = nniBig)
  .setUnknown(EXTENSIONS.decodeUnknown);

/** SignatureInfo on Interest or Data. */
export class SigInfo {
  public static decodeFrom(decoder: Decoder): SigInfo {
    return EVD.decode(new SigInfo(), decoder);
  }

  public type: number = SigType.Null;
  public keyLocator?: KeyLocator;
  public nonce?: Uint8Array;
  public time?: number;
  public seqNum?: bigint;
  public readonly [Extensible.TAG] = EXTENSIONS;

  /**
   * Construct from flexible arguments.
   *
   * Arguments can include, in any order:
   * - SigInfo to copy from
   * - number as SigType
   * - KeyLocator, or Name/URI/KeyDigest to construct KeyLocator
   * - SigInfo.Nonce(v)
   * - SigInfo.Time(v)
   * - SigInfo.SeqNum(v)
   */
  constructor(...args: SigInfo.CtorArg[]) {
    const klArgs: KeyLocator.CtorArg[] = [];
    for (const arg of args) {
      if (typeof arg === "number") {
        this.type = arg;
      } else if (KeyLocator.isCtorArg(arg)) {
        klArgs.push(arg);
      } else if (arg instanceof SigInfo) {
        Object.assign(this, arg);
        Extensible.cloneRecord(this, arg);
      } else if (arg[ctorAssign]) {
        arg[ctorAssign](this);
      } else {
        throw new Error("unknown SigInfo constructor argument");
      }
    }
    if (klArgs.length > 0) {
      this.keyLocator = new KeyLocator(...klArgs);
    }
  }

  /**
   * Create an Encodable.
   * @param tt either TT.ISigInfo or TT.DSigInfo.
   */
  public encodeAs(tt: number): EncodableObj {
    return {
      encodeTo: (encoder) => this.encodeTo(encoder, tt),
    };
  }

  private encodeTo(encoder: Encoder, tt: number) {
    encoder.prependTlv(tt,
      [TT.SigType, NNI(this.type)],
      this.keyLocator,
      [TT.SigNonce, Encoder.OmitEmpty, this.nonce],
      this.time !== undefined && [TT.SigTime, NNI(this.time)],
      this.seqNum !== undefined && [TT.SigSeqNum, NNI(this.seqNum)],
      ...EXTENSIONS.encode(this),
    );
  }
}

const ctorAssign = Symbol("SigInfo.ctorAssign");
interface CtorTag {
  [ctorAssign]: (si: SigInfo) => void;
}

export namespace SigInfo {
  export function Nonce(v?: Uint8Array | number): CtorTag {
    return {
      [ctorAssign](si: SigInfo) {
        si.nonce = v instanceof Uint8Array ? v : generateNonce(v);
      },
    };
  }

  /** Generate a random nonce. */
  export function generateNonce(size = 8): Uint8Array {
    assert(size >= 1);
    return crypto.getRandomValues(new Uint8Array(size));
  }

  export function Time(v = Date.now()): CtorTag {
    return {
      [ctorAssign](si: SigInfo) { si.time = v; },
    };
  }

  export function SeqNum(v: bigint): CtorTag {
    return {
      [ctorAssign](si: SigInfo) { si.seqNum = v; },
    };
  }

  export type CtorArg = SigInfo | number | KeyLocator.CtorArg | CtorTag;

  export const registerExtension = EXTENSIONS.registerExtension;
  export const unregisterExtension = EXTENSIONS.unregisterExtension;
}
