import { Name, NameLike } from "@ndn/name";
import { Decoder, Encoder, EvDecoder, NNI } from "@ndn/tlv";

import { TT } from "./an";

const LIFETIME_DEFAULT = 4000;
const HOPLIMIT_MAX = 255;

const EVD = new EvDecoder<Interest>(TT.Interest, [
  { tt: TT.Name, cb: (self, { decoder }) => { self.name = decoder.decode(Name); } },
  { tt: TT.CanBePrefix, cb: (self) => { self.canBePrefix = true; } },
  { tt: TT.MustBeFresh, cb: (self) => { self.mustBeFresh = true; } },
  // TODO ForwardingHint
  { tt: TT.Nonce, cb: (self, { value }) => { self.nonce = NNI.decode(value, 4); } },
  { tt: TT.InterestLifetime, cb: (self, { value }) => { self.lifetime = NNI.decode(value); } },
  { tt: TT.HopLimit, cb: (self, { value }) => { self.hopLimit = NNI.decode(value, 1); } },
  // TODO AppParameters, ISigInfo, ISigValue
]);

/** Interest packet. */
export class Interest {
  public get name() { return this.name_; }
  public set name(v) { this.name_ = v; }

  public get canBePrefix() { return this.canBePrefix_; }
  public set canBePrefix(v) { this.canBePrefix_ = v; }

  public get mustBeFresh() { return this.mustBeFresh_; }
  public set mustBeFresh(v) { this.mustBeFresh_ = v; }

  public get nonce() { return this.nonce_; }
  public set nonce(v) { this.nonce_ = v; }

  public get lifetime() { return this.lifetime_; }
  public set lifetime(v) { this.lifetime_ = NNI.constrain(v, "InterestLifetime"); }

  public get hopLimit() { return this.hopLimit_; }
  public set hopLimit(v) { this.hopLimit_ = NNI.constrain(v, "HopLimit", HOPLIMIT_MAX); }

  public static decodeFrom(decoder: Decoder): Interest {
    const self = new Interest();
    EVD.decode(self, decoder);
    return self;
  }

  private name_: Name = new Name();
  private canBePrefix_: boolean = false;
  private mustBeFresh_: boolean = false;
  private nonce_: number|undefined;
  private lifetime_: number = LIFETIME_DEFAULT;
  private hopLimit_: number = HOPLIMIT_MAX;

  /**
   * Construct from flexible arguments.
   *
   * Arguments can include, in any order:
   * - Interest to copy from
   * - Name or name URI
   * - Interest.CanBePrefix
   * - Interest.MustBeFresh
   * - Interest.Nonce(v)
   * - Interest.Lifetime(v)
   * - Interest.HopLimit(v)
   */
  constructor(...args: Array<Interest | Interest.CtorArg>) {
    args.forEach((arg) => {
      if (Name.isNameLike(arg)) {
        this.name = new Name(arg);
      } else if (arg === Interest.CanBePrefix) {
        this.canBePrefix = true;
      } else if (arg === Interest.MustBeFresh) {
        this.mustBeFresh = true;
      } else if (arg instanceof NonceTag) {
        this.nonce = arg.v;
      } else if (arg instanceof LifetimeTag) {
        this.lifetime = arg.v;
      } else if (arg instanceof HopLimitTag) {
        this.hopLimit = arg.v;
      } else if (arg instanceof Interest) {
        Object.assign(this, arg);
      } else {
        throw new Error("unknown Interest constructor argument");
      }
    });
  }

  public encodeTo(encoder: Encoder) {
    if (this.name.size < 1) {
      throw new Error("Interest name is empty");
    }

    const nonce = typeof this.nonce === "undefined" ?
                  Math.random() * 0x100000000 : this.nonce;

    encoder.prependTlv(TT.Interest,
      this.name,
      this.canBePrefix ? [TT.CanBePrefix] : undefined,
      this.mustBeFresh ? [TT.MustBeFresh] : undefined,
      [TT.Nonce, NNI(nonce, 4)],
      this.lifetime !== LIFETIME_DEFAULT ?
        [TT.InterestLifetime, NNI(this.lifetime)] : undefined,
      this.hopLimit !== HOPLIMIT_MAX ?
        [TT.HopLimit, NNI(this.hopLimit, 1)] : undefined,
    );
  }
}

class NonceTag {
  constructor(public v: number) {
  }
}

class LifetimeTag {
  constructor(public v: number) {
  }
}

class HopLimitTag {
  constructor(public v: number) {
  }
}

export namespace Interest {
  export const CanBePrefix = Symbol("CanBePrefix");
  export const MustBeFresh = Symbol("MustBeFresh");

  export function Nonce(v: number): NonceTag {
    return new NonceTag(v);
  }

  export function Lifetime(v: number): LifetimeTag {
    return new LifetimeTag(v);
  }

  export function HopLimit(v: number): HopLimitTag {
    return new HopLimitTag(v);
  }

  export type CtorArg = NameLike | typeof CanBePrefix | typeof MustBeFresh |
                        LifetimeTag | HopLimitTag;
}
