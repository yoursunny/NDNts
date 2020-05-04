import { Decoder, Encoder, EvDecoder, NNI } from "@ndn/tlv";
import assert from "minimalistic-assert";

import { TT } from "./an";
import { ParamsDigest } from "./digest-comp";
import { FwHint } from "./fwhint";
import { LLSign, LLVerify } from "./llsign";
import { Name, NameLike } from "./name";
import { sha256 } from "./platform/mod";
import { SigInfo } from "./sig-info";

const HOPLIMIT_MAX = 255;
const FIELDS = Symbol("Interest.FIELDS");

class Fields {
  constructor(...args: Array<Interest | Interest.CtorArg>) {
    args.forEach((arg) => {
      if (Name.isNameLike(arg)) {
        this.name = new Name(arg);
      } else if (arg === Interest.CanBePrefix) {
        this.canBePrefix = true;
      } else if (arg === Interest.MustBeFresh) {
        this.mustBeFresh = true;
      } else if (arg instanceof FwHint) {
        this.fwHint = new FwHint(arg);
      } else if (arg instanceof NonceTag) {
        this.nonce = arg.v;
      } else if (arg instanceof LifetimeTag) {
        this.lifetime = arg.v;
      } else if (arg instanceof HopLimitTag) {
        this.hopLimit = arg.v;
      } else if (arg instanceof Uint8Array) {
        this.appParameters = arg;
      } else if (arg instanceof Interest) {
        Object.assign(this, arg[FIELDS]);
      } else {
        throw new Error("unknown Interest constructor argument");
      }
    });
  }

  public name: Name = new Name();
  public canBePrefix = false;
  public mustBeFresh = false;
  public fwHint?: FwHint;
  public get nonce() { return this.nonce_; }
  public set nonce(v) { this.nonce_ = v && NNI.constrain(v, "Nonce", 0xFFFFFFFF); }
  public get lifetime() { return this.lifetime_; }
  public set lifetime(v) { this.lifetime_ = NNI.constrain(v, "InterestLifetime"); }
  public get hopLimit() { return this.hopLimit_; }
  public set hopLimit(v) { this.hopLimit_ = NNI.constrain(v, "HopLimit", HOPLIMIT_MAX); }
  public appParameters?: Uint8Array;
  public sigInfo?: SigInfo;
  public sigValue?: Uint8Array;

  private nonce_: number|undefined;
  private lifetime_: number = Interest.DefaultLifetime;
  private hopLimit_: number = HOPLIMIT_MAX;

  public signedPortion?: Uint8Array;
  public paramsPortion?: Uint8Array;
}
const FIELD_LIST: Array<keyof Fields> = ["name", "canBePrefix", "mustBeFresh", "fwHint", "nonce", "lifetime", "hopLimit", "appParameters", "sigInfo", "sigValue"];
const FIELD_SIGNED_LIST = new Set<keyof Fields>(["name", "appParameters", "sigInfo"]);
const FIELD_PARAMS_LIST = new Set<keyof Fields>(["appParameters", "sigInfo", "sigValue"]);

const EVD = new EvDecoder<Fields>("Interest", TT.Interest)
  .add(TT.Name, (t, { decoder }) => t.name = decoder.decode(Name), { required: true })
  .add(TT.CanBePrefix, (t) => t.canBePrefix = true)
  .add(TT.MustBeFresh, (t) => t.mustBeFresh = true)
  .add(TT.ForwardingHint, (t, { value }) => t.fwHint = FwHint.decodeValue(value))
  .add(TT.Nonce, (t, { value }) => t.nonce = NNI.decode(value, 4))
  .add(TT.InterestLifetime, (t, { nni }) => t.lifetime = nni)
  .add(TT.HopLimit, (t, { value }) => t.hopLimit = NNI.decode(value, 1))
  .add(TT.AppParameters, (t, { value, tlv, after }) => {
    if (ParamsDigest.findIn(t.name, false) < 0) {
      throw new Error("ParamsDigest missing in parameterized Interest");
    }
    t.appParameters = value;
    t.paramsPortion = new Uint8Array(tlv.buffer, tlv.byteOffset,
      tlv.byteLength + after.byteLength);
  })
  .add(TT.ISigInfo, (t, { decoder }) => t.sigInfo = decoder.decode(SigInfo))
  .add(TT.ISigValue, (t, { value, tlv }) => {
    if (!ParamsDigest.match(t.name.at(-1))) {
      throw new Error("ParamsDigest missing or out of place in signed Interest");
    }
    if (!t.paramsPortion) {
      throw new Error("AppParameters missing in signed Interest");
    }
    if (typeof t.sigInfo === "undefined") {
      throw new Error("ISigInfo missing in signed Interest");
    }

    assert(tlv.buffer === t.paramsPortion.buffer);
    t.sigValue = value;

    const signedPart0 = t.name.getPrefix(-1).value;
    const signedPart1 = new Uint8Array(tlv.buffer, t.paramsPortion.byteOffset,
      tlv.byteOffset - t.paramsPortion.byteOffset);
    t.signedPortion = new Uint8Array(signedPart0.byteLength + signedPart1.byteLength);
    t.signedPortion.set(signedPart0, 0);
    t.signedPortion.set(signedPart1, signedPart0.byteLength);
  });

/** Interest packet. */
export class Interest implements LLSign.Signable, LLVerify.Verifiable {
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
   * - Uint8Array as AppParameters
   */
  constructor(...args: Array<Interest | Interest.CtorArg>) {
    this[FIELDS] = new Fields(...args);
  }

  public readonly [FIELDS]: Fields;

  public static decodeFrom(decoder: Decoder): Interest {
    const interest = new Interest();
    EVD.decode(interest[FIELDS], decoder);
    return interest;
  }

  public encodeTo(encoder: Encoder) {
    const f = this[FIELDS];
    if (f.name.length === 0) {
      throw new Error("invalid empty Interest name");
    }
    if (f.appParameters && ParamsDigest.findIn(f.name, false) < 0) {
      throw new Error("ParamsDigest missing");
    }

    encoder.prependTlv(TT.Interest,
      f.name,
      f.canBePrefix ? [TT.CanBePrefix] : undefined,
      f.mustBeFresh ? [TT.MustBeFresh] : undefined,
      f.fwHint,
      [TT.Nonce, NNI(f.nonce ?? Interest.generateNonce(), 4)],
      f.lifetime === Interest.DefaultLifetime ?
        undefined : [TT.InterestLifetime, NNI(f.lifetime)],
      f.hopLimit === HOPLIMIT_MAX ?
        undefined : [TT.HopLimit, NNI(f.hopLimit, 1)],
      f.appParameters ?
        [TT.AppParameters, f.appParameters] : undefined,
      f.sigInfo ?
        f.sigInfo.encodeAs(TT.ISigInfo) : undefined,
      f.sigValue ?
        [TT.ISigValue, f.sigValue] : undefined,
    );
  }

  private appendParamsDigestPlaceholder(): number {
    const f = this[FIELDS];
    this.name = f.name.append(ParamsDigest.PLACEHOLDER);
    return f.name.length - 1;
  }

  public async updateParamsDigest(): Promise<void> {
    const f = this[FIELDS];
    let pdIndex = ParamsDigest.findIn(f.name);
    if (pdIndex < 0) {
      pdIndex = this.appendParamsDigestPlaceholder();
    }
    if (!f.appParameters) {
      f.appParameters = new Uint8Array();
    }

    f.paramsPortion = Encoder.encode([
      [TT.AppParameters, f.appParameters],
      f.sigInfo ?
        f.sigInfo.encodeAs(TT.ISigInfo) : undefined,
      [TT.ISigValue, Encoder.OmitEmpty, f.sigValue],
    ]);
    const d = await sha256(f.paramsPortion);
    f.name = f.name.replaceAt(pdIndex, ParamsDigest.create(d));
  }

  public async validateParamsDigest(): Promise<void> {
    const f = this[FIELDS];
    if (typeof f.appParameters === "undefined") {
      return;
    }

    const params = f.paramsPortion;
    if (typeof params === "undefined") {
      throw new Error("parameters portion is empty");
    }

    const pdComp = f.name.at(ParamsDigest.findIn(f.name, false));
    const d = await sha256(params);
    // This is not a constant-time comparison. It's for integrity purpose only.
    if (!pdComp.equals(ParamsDigest.create(d))) {
      throw new Error("incorrect ParamsDigest");
    }
  }

  public async [LLSign.OP](sign: LLSign) {
    const f = this[FIELDS];
    let pdIndex = ParamsDigest.findIn(f.name);
    if (pdIndex < 0) {
      pdIndex = this.appendParamsDigestPlaceholder();
    } else if (pdIndex !== f.name.length - 1) {
      throw new Error("ParamsDigest out of place for signed Interest");
    }

    f.signedPortion = Encoder.encode([
      f.name.getPrefix(-1).value,
      [TT.AppParameters, f.appParameters],
      f.sigInfo ? f.sigInfo.encodeAs(TT.ISigInfo) : undefined,
    ]);
    this.sigValue = await sign(f.signedPortion);
    return this.updateParamsDigest();
  }

  public async [LLVerify.OP](verify: LLVerify) {
    const f = this[FIELDS];
    await this.validateParamsDigest();
    if (!f.sigValue) {
      throw new Error("SigValue is missing");
    }
    const signedPortion = f.signedPortion;
    if (!signedPortion) {
      throw new Error("SignedPortion is missing");
    }
    await verify(signedPortion, f.sigValue);
  }
}
export interface Interest extends Fields {}
for (const field of FIELD_LIST) {
  Object.defineProperty(Interest.prototype, field, {
    enumerable: true,
    get(this: Interest) { return this[FIELDS][field]; },
    set(this: Interest, v: any) {
      const f = this[FIELDS];
      (f[field] as any) = v;
      if (FIELD_SIGNED_LIST.has(field)) {
        f.signedPortion = undefined;
      }
      if (FIELD_PARAMS_LIST.has(field)) {
        f.paramsPortion = undefined;
      }
    },
  });
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
  export const Parameterize: LLSign = () => Promise.resolve(new Uint8Array());

  export const CanBePrefix = Symbol("Interest.CanBePrefix");
  export const MustBeFresh = Symbol("Interest.MustBeFresh");

  export function Nonce(v = generateNonce()): NonceTag {
    return new NonceTag(v);
  }

  /** Generate a random nonce. */
  export const generateNonce = SigInfo.generateNonce;

  export function Lifetime(v: number): LifetimeTag {
    return new LifetimeTag(v);
  }

  export const DefaultLifetime = 4000;

  export function HopLimit(v: number): HopLimitTag {
    return new HopLimitTag(v);
  }

  export type CtorArg = NameLike | typeof CanBePrefix | typeof MustBeFresh | FwHint |
  LifetimeTag | HopLimitTag | Uint8Array;
}
