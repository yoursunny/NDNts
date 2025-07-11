import { type Decoder, type EncodableObj, Encoder, EvDecoder, Extensible, ExtensionRegistry, NNI } from "@ndn/tlv";
import { assert } from "@ndn/util";

import { SigType, TT } from "./an";
import { KeyLocator } from "./key-locator";
import { ValidityPeriod } from "./validity-period";

const EXTENSIONS: ExtensionRegistry<SigInfo> = new ExtensionRegistry<SigInfo>();

const EVD = new EvDecoder<SigInfo>("SigInfo", [TT.ISigInfo, TT.DSigInfo])
  .add(TT.SigType, (t, { nni }) => t.type = nni, { required: true })
  .add(TT.KeyLocator, (t, { decoder }) => t.keyLocator = decoder.decode(KeyLocator))
  .add(TT.SigNonce, (t, { value }) => t.nonce = value)
  .add(TT.SigTime, (t, { nni }) => t.time = nni)
  .add(TT.SigSeqNum, (t, { nniBig }) => t.seqNum = nniBig)
  .add(TT.ValidityPeriod, (t, { decoder }) => t.validity = decoder.decode(ValidityPeriod))
  .setUnknown(EXTENSIONS.decodeUnknown);

/** SignatureInfo on Interest or Data. */
export class SigInfo {
  public static decodeFrom(decoder: Decoder): SigInfo {
    return EVD.decode(new SigInfo(), decoder);
  }

  /**
   * Construct from flexible arguments.
   *
   * Arguments can include, in any order:
   * - {@link SigInfo} to copy from
   * - number as SigType
   * - {@link KeyLocator}, or Name/URI/KeyDigest to construct KeyLocator
   * - {@link SigInfo.Nonce}`(v)`
   * - {@link SigInfo.Time}`(v)`
   * - {@link SigInfo.SeqNum}`(v)`
   * - {@link ValidityPeriod}
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
      } else if (arg instanceof ValidityPeriod) {
        this.validity = arg;
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

  public type: number = SigType.Null;
  public keyLocator?: KeyLocator;
  public nonce?: Uint8Array;
  public time?: number;
  public seqNum?: bigint;
  public validity?: ValidityPeriod;
  public readonly [Extensible.TAG] = EXTENSIONS;

  /**
   * Create an Encodable.
   * @param tt - Either `TT.ISigInfo` or `TT.DSigInfo`.
   */
  public encodeAs(tt: number): EncodableObj {
    return {
      encodeTo: (encoder) => this.encodeTo(encoder, tt),
    };
  }

  private encodeTo(encoder: Encoder, tt: number) {
    encoder.prependTlv(
      tt,
      [TT.SigType, NNI(this.type)],
      this.keyLocator,
      [TT.SigNonce, Encoder.OmitEmpty, this.nonce],
      this.time !== undefined && [TT.SigTime, NNI(this.time)],
      this.seqNum !== undefined && [TT.SigSeqNum, NNI(this.seqNum)],
      this.validity,
      ...EXTENSIONS.encode(this),
    );
  }
}

const ctorAssign = Symbol("@ndn/packet#SigInfo.ctorAssign");
interface CtorTag {
  [ctorAssign]: (si: SigInfo) => void;
}

export namespace SigInfo {
  /** Constructor argument to set SigNonce field. */
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

  /** Constructor argument to set SigTime field. */
  export function Time(v = Date.now()): CtorTag {
    return {
      [ctorAssign](si: SigInfo) { si.time = v; },
    };
  }

  /** Constructor argument to set SigSeqNum field. */
  export function SeqNum(v: bigint): CtorTag {
    return {
      [ctorAssign](si: SigInfo) { si.seqNum = v; },
    };
  }

  /** Constructor argument. */
  export type CtorArg = SigInfo | number | KeyLocator.CtorArg | CtorTag | ValidityPeriod;
}
