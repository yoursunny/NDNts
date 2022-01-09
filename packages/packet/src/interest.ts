import { type Decoder, type Encodable, Encoder, EvDecoder, NNI } from "@ndn/tlv";
import assert from "minimalistic-assert";

import { TT } from "./an";
import { FwHint } from "./fwhint";
import { Name, type NameLike, ParamsDigest } from "./name/mod";
import { sha256 } from "./security/helper_node";
import { LLSign, LLVerify, Signer, Verifier } from "./security/signing";
import { SigInfo } from "./sig-info";

const HOPLIMIT_MAX = 255;
const FIELDS = Symbol("Interest.FIELDS");

class Fields {
  constructor(...args: Array<Interest | Interest.CtorArg>) {
    for (const arg of args) {
      if (Name.isNameLike(arg)) {
        this.name = new Name(arg);
      } else if (arg instanceof FwHint) {
        this.fwHint = new FwHint(arg);
      } else if (arg instanceof Uint8Array) {
        this.appParameters = arg;
      } else if (arg instanceof Interest) {
        Object.assign(this, arg[FIELDS]);
      } else if (arg[ctorAssign]) {
        arg[ctorAssign](this);
      } else {
        throw new Error("unknown Interest constructor argument");
      }
    }
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
  public sigValue = new Uint8Array();

  private nonce_: number | undefined;
  private lifetime_: number = Interest.DefaultLifetime;
  private hopLimit_: number = HOPLIMIT_MAX;

  public signedPortion?: Uint8Array;
  public paramsPortion?: Uint8Array;
}
const FIELD_LIST: Partial<Record<keyof Fields, Array<keyof Fields>>> = {
  name: ["signedPortion"],
  canBePrefix: [],
  mustBeFresh: [],
  fwHint: [],
  nonce: [],
  lifetime: [],
  hopLimit: [],
  appParameters: ["signedPortion", "paramsPortion"],
  sigInfo: ["signedPortion", "paramsPortion"],
  sigValue: ["paramsPortion"],
};

const EVD = new EvDecoder<Fields>("Interest", TT.Interest)
  .add(TT.Name, (t, { decoder }) => t.name = decoder.decode(Name), { required: true })
  .add(TT.CanBePrefix, (t) => t.canBePrefix = true)
  .add(TT.MustBeFresh, (t) => t.mustBeFresh = true)
  .add(TT.ForwardingHint, (t, { vd }) => t.fwHint = FwHint.decodeValue(vd))
  .add(TT.Nonce, (t, { value }) => t.nonce = NNI.decode(value, { len: 4 }))
  .add(TT.InterestLifetime, (t, { nni }) => t.lifetime = nni)
  .add(TT.HopLimit, (t, { value }) => t.hopLimit = NNI.decode(value, { len: 1 }))
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
    if (!t.name.at(-1).is(ParamsDigest)) {
      throw new Error("ParamsDigest missing or out of place in signed Interest");
    }
    if (!t.paramsPortion) {
      throw new Error("AppParameters missing in signed Interest");
    }
    if (t.sigInfo === undefined) {
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
export class Interest implements LLSign.Signable, LLVerify.Verifiable, Signer.Signable, Verifier.Verifiable {
  /**
   * Construct from flexible arguments.
   *
   * Arguments can include, in any order:
   * - Interest to copy from
   * - Name or name URI
   * - Interest.CanBePrefix
   * - Interest.MustBeFresh
   * - FwHint
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
      [TT.Nonce, NNI(f.nonce ?? Interest.generateNonce(), { len: 4 })],
      f.lifetime === Interest.DefaultLifetime ?
        undefined : [TT.InterestLifetime, NNI(f.lifetime)],
      f.hopLimit === HOPLIMIT_MAX ?
        undefined : [TT.HopLimit, NNI(f.hopLimit, { len: 1 })],
      ...this.encodeParamsPortion(),
    );
  }

  private encodeParamsPortion(): Encodable[] {
    if (!this.appParameters) {
      return [];
    }
    const w: Encodable[] = [[TT.AppParameters, this.appParameters]];
    if (this.sigInfo) {
      w.push(
        this.sigInfo.encodeAs(TT.ISigInfo),
        [TT.ISigValue, this.sigValue],
      );
    }
    return w;
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

    f.paramsPortion = Encoder.encode(this.encodeParamsPortion());
    const d = await sha256(f.paramsPortion);
    f.name = f.name.replaceAt(pdIndex, ParamsDigest.create(d));
  }

  public async validateParamsDigest(): Promise<void> {
    const f = this[FIELDS];
    if (f.appParameters === undefined) {
      return;
    }

    const params = f.paramsPortion;
    if (params === undefined) {
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
    const signedPortion = f.signedPortion;
    if (!signedPortion) {
      throw new Error("SignedPortion is missing");
    }
    await verify(signedPortion, f.sigValue);
  }
}
export interface Interest extends Fields {}
for (const [field, clearing] of Object.entries(FIELD_LIST) as Iterable<[keyof Fields, Array<keyof Fields>]>) {
  Object.defineProperty(Interest.prototype, field, {
    enumerable: true,
    get(this: Interest) { return this[FIELDS][field]; },
    set(this: Interest, v: any) {
      const f = this[FIELDS];
      (f[field] as any) = v;
      for (const c of clearing) {
        (f[c] as any) = undefined;
      }
    },
  });
}

const ctorAssign = Symbol("Interest.ctorAssign");
interface CtorTag {
  [ctorAssign]: (f: Fields) => void;
}

export namespace Interest {
  /** Signer that calculates ParamsDigest. */
  export const Parameterize: LLSign = () => Promise.resolve(new Uint8Array());

  /** Generate a random nonce. */
  export function generateNonce(): number {
    return Math.trunc(Math.random() * 0x100000000);
  }

  /** Default InterestLifetime. */
  export const DefaultLifetime = 4000;

  /** Constructor argument to set CanBePrefix flag. */
  export const CanBePrefix: CtorTag = {
    [ctorAssign](f: Fields) { f.canBePrefix = true; },
  };

  /** Constructor argument to set MustBeFresh flag. */
  export const MustBeFresh: CtorTag = {
    [ctorAssign](f: Fields) { f.mustBeFresh = true; },
  };

  /** Constructor argument to set Nonce field. */
  export function Nonce(v = generateNonce()): CtorTag {
    return {
      [ctorAssign](f: Fields) { f.nonce = v; },
    };
  }

  /** Constructor argument to set InterestLifetime field. */
  export function Lifetime(v: number): CtorTag {
    return {
      [ctorAssign](f: Fields) { f.lifetime = v; },
    };
  }

  /** Constructor argument to set HopLimit field. */
  export function HopLimit(v: number): CtorTag {
    return {
      [ctorAssign](f: Fields) { f.hopLimit = v; },
    };
  }

  /** Constructor argument. */
  export type CtorArg = NameLike | FwHint | CtorTag | Uint8Array;

  /** A function to modify an existing Interest. */
  export type ModifyFunc = (interest: Interest) => void;

  /** Common fields to assign onto an existing Interest. */
  export interface ModifyFields {
    canBePrefix?: boolean;
    mustBeFresh?: boolean;
    fwHint?: FwHint;
    lifetime?: number;
    hopLimit?: number;
  }

  /** A structure to modify an existing Interest. */
  export type Modify = ModifyFunc | ModifyFields;

  /** Turn ModifyFields to ModifyFunc; return ModifyFunc as-is. */
  export function makeModifyFunc(input?: Modify): ModifyFunc {
    switch (typeof input) {
      case "function":
        return input;
      case "undefined":
        return () => undefined;
    }
    const {
      canBePrefix,
      mustBeFresh,
      fwHint,
      lifetime,
      hopLimit,
    } = input;
    return (interest) => {
      if (canBePrefix !== undefined) {
        interest.canBePrefix = canBePrefix;
      }
      if (mustBeFresh !== undefined) {
        interest.mustBeFresh = mustBeFresh;
      }
      if (fwHint !== undefined) {
        interest.fwHint = fwHint;
      }
      if (lifetime !== undefined) {
        interest.lifetime = lifetime;
      }
      if (hopLimit !== undefined) {
        interest.hopLimit = hopLimit;
      }
    };
  }
}
