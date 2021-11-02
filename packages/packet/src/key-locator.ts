import { Decoder, Encoder, EvDecoder } from "@ndn/tlv";

import { TT } from "./an";
import { Name, NameLike } from "./name/mod";

const EVD = new EvDecoder<KeyLocator>("KeyLocator", TT.KeyLocator)
  .add(TT.Name, (t, { value }) => t.name = new Name(value))
  .add(TT.KeyDigest, (t, { value }) => t.digest = value);

/** KeyLocator in SigInfo. */
export class KeyLocator {
  public static decodeFrom(decoder: Decoder): KeyLocator {
    return EVD.decode(new KeyLocator(), decoder);
  }

  public name?: Name;
  public digest?: Uint8Array;

  constructor(...args: KeyLocator.CtorArg[]) {
    for (const arg of args) {
      if (Name.isNameLike(arg)) {
        this.name = new Name(arg);
      } else if (arg instanceof Uint8Array) {
        this.digest = arg;
      } else if (arg instanceof KeyLocator) {
        Object.assign(this, arg);
      } else {
        throw new Error("unknown KeyLocator constructor argument");
      }
    }
  }

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(TT.KeyLocator, Encoder.OmitEmpty,
      this.name,
      [TT.KeyDigest, Encoder.OmitEmpty, this.digest]);
  }
}

export namespace KeyLocator {
  export type CtorArg = KeyLocator | NameLike | Uint8Array;

  export function isCtorArg(arg: unknown): arg is CtorArg {
    return arg instanceof KeyLocator || Name.isNameLike(arg) || arg instanceof Uint8Array;
  }

  /** Throw if KeyLocator is missing or does not have Name. */
  export function mustGetName(kl?: KeyLocator): Name {
    if (!kl || !kl.name) {
      throw new Error("KeyLocator does not have name");
    }
    return kl.name;
  }
}
