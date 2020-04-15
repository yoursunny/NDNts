import { Decoder, Encoder, EvDecoder, NNI } from "@ndn/tlv";
import assert from "minimalistic-assert";

import { FwHint } from "./fwhint";
import { LLSign, LLVerify, Name, NameLike, ParamsDigest, SigInfo, TT } from "./mod";
import { sha256 } from "./platform/mod";

const HOPLIMIT_MAX = 255;
const SignedPortion = Symbol("Interest.SignedPortion");
const ParamsPortion = Symbol("Interest.ParamsPortion");

const EVD = new EvDecoder<Interest>("Interest", TT.Interest)
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
    t[ParamsPortion] = new Uint8Array(tlv.buffer, tlv.byteOffset,
      tlv.byteLength + after.byteLength);
  })
  .add(TT.ISigInfo, (t, { decoder }) => t.sigInfo = decoder.decode(SigInfo))
  .add(TT.ISigValue, (t, { value, tlv }) => {
    if (!ParamsDigest.match(t.name.at(-1))) {
      throw new Error("ParamsDigest missing or out of place in signed Interest");
    }
    const params = t[ParamsPortion];
    if (!params) {
      throw new Error("AppParameters missing in signed Interest");
    }
    if (typeof t.sigInfo === "undefined") {
      throw new Error("ISigInfo missing in signed Interest");
    }

    assert(tlv.buffer === params.buffer);
    t.sigValue = value;
    t[SignedPortion] = Encoder.encode([
      t.name.getPrefix(-1).value,
      new Uint8Array(tlv.buffer, params.byteOffset, tlv.byteOffset - params.byteOffset),
    ]);
  });

/** Interest packet. */
export class Interest implements LLSign.Signable, LLVerify.Verifiable {
  public get nonce() { return this.nonce_; }
  public set nonce(v) { this.nonce_ = v && NNI.constrain(v, "Nonce", 0xFFFFFFFF); }

  public get lifetime() { return this.lifetime_; }
  public set lifetime(v) { this.lifetime_ = NNI.constrain(v, "InterestLifetime"); }

  public get hopLimit() { return this.hopLimit_; }
  public set hopLimit(v) { this.hopLimit_ = NNI.constrain(v, "HopLimit", HOPLIMIT_MAX); }

  public static decodeFrom(decoder: Decoder): Interest {
    return EVD.decode(new Interest(), decoder);
  }

  public name: Name = new Name();
  public canBePrefix = false;
  public mustBeFresh = false;
  public fwHint?: FwHint;
  public appParameters?: Uint8Array;
  public sigInfo?: SigInfo;
  public sigValue?: Uint8Array;

  public [SignedPortion]?: Uint8Array;
  public [ParamsPortion]?: Uint8Array;

  private nonce_: number|undefined;
  private lifetime_: number = Interest.DefaultLifetime;
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
   * - Uint8Array as AppParameters
   */
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
        Object.assign(this, arg);
      } else {
        throw new Error("unknown Interest constructor argument");
      }
    });
  }

  public encodeTo(encoder: Encoder) {
    if (this.name.length === 0) {
      throw new Error("invalid empty Interest name");
    }
    if (this.appParameters && ParamsDigest.findIn(this.name, false) < 0) {
      throw new Error("ParamsDigest missing");
    }

    encoder.prependTlv(TT.Interest,
      this.name,
      this.canBePrefix ? [TT.CanBePrefix] : undefined,
      this.mustBeFresh ? [TT.MustBeFresh] : undefined,
      this.fwHint,
      [TT.Nonce, NNI(this.nonce ?? Interest.generateNonce(), 4)],
      this.lifetime === Interest.DefaultLifetime ?
        undefined : [TT.InterestLifetime, NNI(this.lifetime)],
      this.hopLimit === HOPLIMIT_MAX ?
        undefined : [TT.HopLimit, NNI(this.hopLimit, 1)],
      this.appParameters ?
        [TT.AppParameters, this.appParameters] : undefined,
      this.sigInfo ?
        this.sigInfo.encodeAs(TT.ISigInfo) : undefined,
      this.sigValue ?
        [TT.ISigValue, this.sigValue] : undefined,
    );
  }

  private appendParamsDigestPlaceholder(): number {
    this.name = this.name.append(ParamsDigest.PLACEHOLDER);
    return this.name.length - 1;
  }

  public async updateParamsDigest(): Promise<void> {
    let pdIndex = ParamsDigest.findIn(this.name);
    if (pdIndex < 0) {
      pdIndex = this.appendParamsDigestPlaceholder();
    }
    if (!this.appParameters) {
      this.appParameters = new Uint8Array();
    }

    const params = Encoder.encode([
      [TT.AppParameters, this.appParameters],
      this.sigInfo ?
        this.sigInfo.encodeAs(TT.ISigInfo) : undefined,
      [TT.ISigValue, Encoder.OmitEmpty, this.sigValue],
    ]);
    this[ParamsPortion] = params;
    const d = await sha256(params);
    this.name = this.name.replaceAt(pdIndex, ParamsDigest.create(d));
  }

  public async validateParamsDigest(): Promise<void> {
    if (typeof this.appParameters === "undefined") {
      return;
    }

    const params = this[ParamsPortion];
    if (typeof params === "undefined") {
      throw new Error("parameters portion is empty");
    }

    const pdComp = this.name.at(ParamsDigest.findIn(this.name, false));
    const d = await sha256(params);
    // This is not a constant-time comparison. It's for integrity purpose only.
    if (!pdComp.equals(ParamsDigest.create(d))) {
      throw new Error("incorrect ParamsDigest");
    }
  }

  public async [LLSign.OP](sign: LLSign) {
    let pdIndex = ParamsDigest.findIn(this.name);
    if (pdIndex < 0) {
      pdIndex = this.appendParamsDigestPlaceholder();
    } else if (pdIndex !== this.name.length - 1) {
      throw new Error("ParamsDigest out of place for signed Interest");
    }

    const signedPortion = Encoder.encode([
      this.name.getPrefix(-1).value,
      [TT.AppParameters, this.appParameters],
      this.sigInfo ?
        this.sigInfo.encodeAs(TT.ISigInfo) : undefined,
    ]);
    this[SignedPortion] = signedPortion;
    this.sigValue = await sign(signedPortion);
    return this.updateParamsDigest();
  }

  public async [LLVerify.OP](verify: LLVerify) {
    await this.validateParamsDigest();
    if (!this.sigValue) {
      throw new Error("SigValue is missing");
    }
    const signedPortion = this[SignedPortion];
    if (!signedPortion) {
      throw new Error("SignedPortion is missing");
    }
    await verify(signedPortion, this.sigValue);
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
  export const Parameterize: LLSign = () => Promise.resolve(new Uint8Array());

  export const CanBePrefix = Symbol("Interest.CanBePrefix");
  export const MustBeFresh = Symbol("Interest.MustBeFresh");

  export function Nonce(v: number): NonceTag {
    return new NonceTag(v);
  }

  export function Lifetime(v: number): LifetimeTag {
    return new LifetimeTag(v);
  }

  export const DefaultLifetime = 4000;

  export function HopLimit(v: number): HopLimitTag {
    return new HopLimitTag(v);
  }

  export type CtorArg = NameLike | typeof CanBePrefix | typeof MustBeFresh | FwHint |
  LifetimeTag | HopLimitTag | Uint8Array;

  /** Generate a random nonce. */
  export function generateNonce(): number {
    return Math.floor(Math.random() * 0x100000000);
  }
}
