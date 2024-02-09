import { type Decoder, type Encodable, Encoder, EvDecoder, NNI } from "@ndn/tlv";
import { assert, constrain, sha256 } from "@ndn/util";
import type { Except, Schema } from "type-fest";

import { TT } from "./an";
import { FwHint } from "./fwhint";
import { definePublicFields, FIELDS } from "./impl-public-fields";
import { Name, type NameLike, ParamsDigest } from "./name/mod";
import { LLSign, LLVerify, type Signer, type Verifier } from "./security/signing";
import { SigInfo } from "./sig-info";

const HOPLIMIT_MAX = 255;

class Fields {
  constructor(...args: Array<Interest | Interest.CtorArg>) {
    for (const arg of args) {
      if (Name.isNameLike(arg)) {
        this.name = Name.from(arg);
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
  public set nonce(v) { this.nonce_ = v && constrain(v, "Nonce", 0xFFFFFFFF); }
  private nonce_: number | undefined;

  public get lifetime() { return this.lifetime_; }
  public set lifetime(v) { this.lifetime_ = constrain(Math.trunc(v), "InterestLifetime"); }
  private lifetime_: number = Interest.DefaultLifetime;

  public get hopLimit() { return this.hopLimit_; }
  public set hopLimit(v) { this.hopLimit_ = constrain(v, "HopLimit", HOPLIMIT_MAX); }
  private hopLimit_: number = HOPLIMIT_MAX;

  public appParameters?: Uint8Array;
  public sigInfo?: SigInfo;
  public sigValue = new Uint8Array();

  public paramsPortion?: Uint8Array;
  public signedPortion?: Uint8Array;
}
interface PublicFields extends Except<Fields, "paramsPortion" | "signedPortion"> {}

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
    assert(tlv.buffer === after.buffer);
    t.paramsPortion = new Uint8Array(tlv.buffer, tlv.byteOffset, tlv.byteLength + after.byteLength);
  })
  .add(TT.ISigInfo, (t, { decoder }) => t.sigInfo = decoder.decode(SigInfo))
  .add(TT.ISigValue, (t, { value, tlv }) => {
    if (!t.name.get(-1)?.is(ParamsDigest)) {
      throw new Error("ParamsDigest missing or out of place in signed Interest");
    }
    if (!t.paramsPortion) {
      throw new Error("AppParameters missing in signed Interest");
    }
    if (!t.sigInfo) {
      throw new Error("ISigInfo missing in signed Interest");
    }

    assert(tlv.buffer === t.paramsPortion.buffer);
    t.sigValue = value;

    // t.name.value should be readily available during decoding;
    // t.name.getPrefix(-1).value would require re-encoding from components
    const signedPart0 = t.name.value.subarray(0, -t.name.get(-1)!.tlv.byteLength);
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
   * - {@link Interest} to copy from
   * - {@link Name} or name URI
   * - {@link Interest.CanBePrefix}
   * - {@link Interest.MustBeFresh}
   * - {@link FwHint}
   * - {@link Interest.Nonce}`(v)`
   * - {@link Interest.Lifetime}`(v)`
   * - {@link Interest.HopLimit}`(v)`
   * - `Uint8Array` as AppParameters
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
    const { name, canBePrefix, mustBeFresh, fwHint, nonce, lifetime, hopLimit, appParameters } = this[FIELDS];
    if (name.length === 0) {
      throw new Error("invalid empty Interest name");
    }
    if (appParameters && ParamsDigest.findIn(name, false) < 0) {
      throw new Error("ParamsDigest missing");
    }

    encoder.prependTlv(TT.Interest,
      name,
      canBePrefix && [TT.CanBePrefix],
      mustBeFresh && [TT.MustBeFresh],
      fwHint,
      [TT.Nonce, NNI(nonce ?? Interest.generateNonce(), { len: 4 })],
      lifetime !== Interest.DefaultLifetime && [TT.InterestLifetime, NNI(lifetime)],
      hopLimit !== HOPLIMIT_MAX && [TT.HopLimit, NNI(hopLimit, { len: 1 })],
      ...this.encodeParamsPortion(),
    );
  }

  private encodeParamsPortion(): Encodable[] {
    const { appParameters, sigInfo, sigValue } = this[FIELDS];
    if (!appParameters) {
      return [];
    }
    const w: Encodable[] = [[TT.AppParameters, appParameters]];
    if (sigInfo) {
      w.push(
        sigInfo.encodeAs(TT.ISigInfo),
        [TT.ISigValue, sigValue],
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
    f.appParameters ??= new Uint8Array();

    f.paramsPortion = Encoder.encode(this.encodeParamsPortion());
    const d = await sha256(f.paramsPortion);
    f.name = f.name.replaceAt(pdIndex, ParamsDigest.create(d));
  }

  public async validateParamsDigest(requireAppParameters = false): Promise<void> {
    const { appParameters, paramsPortion, name } = this[FIELDS];
    if (!appParameters) {
      if (requireAppParameters) {
        throw new Error("AppParameters is missing");
      }
      return;
    }

    if (!paramsPortion) {
      throw new Error("parameters portion is empty");
    }

    const pdComp = name.at(ParamsDigest.findIn(name, false));
    const d = await sha256(paramsPortion);
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
      ...f.name.getPrefix(-1).comps,
      [TT.AppParameters, f.appParameters],
      f.sigInfo?.encodeAs(TT.ISigInfo),
    ]);
    this.sigValue = await sign(f.signedPortion);
    return this.updateParamsDigest();
  }

  public async [LLVerify.OP](verify: LLVerify) {
    const { signedPortion, sigValue } = this[FIELDS];
    await this.validateParamsDigest();
    if (!signedPortion) {
      throw new Error("SignedPortion is missing");
    }
    await verify(signedPortion, sigValue);
  }
}
export interface Interest extends PublicFields {}
definePublicFields<Interest, Fields, PublicFields>(Interest, {
  name: ["signedPortion"],
  canBePrefix: [],
  mustBeFresh: [],
  fwHint: [],
  nonce: [],
  lifetime: [],
  hopLimit: [],
  appParameters: ["paramsPortion", "signedPortion"],
  sigInfo: ["paramsPortion", "signedPortion"],
  sigValue: ["paramsPortion"],
});

const ctorAssign = Symbol("@ndn/packet#Interest.ctorAssign");
interface CtorTag {
  [ctorAssign]: (f: Fields) => void;
}

const modifyFields = [
  "canBePrefix", "mustBeFresh", "fwHint", "lifetime", "hopLimit",
] as const satisfies ReadonlyArray<keyof PublicFields>;

export namespace Interest {
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
  export type ModifyFields = Partial<Pick<PublicFields, typeof modifyFields[number]>>;

  /** A structure to modify an existing Interest. */
  export type Modify = ModifyFunc | ModifyFields;

  /**
   * Turn {@link ModifyFields} to {@link ModifyFunc}.
   * Return {@link ModifyFunc} as-is.
   */
  export function makeModifyFunc(input: Modify = () => undefined): ModifyFunc {
    if (typeof input === "function") {
      return input;
    }

    const patch: Schema<ModifyFields, unknown> = {};
    for (const key of modifyFields) {
      if (input[key] !== undefined) {
        patch[key] = input[key];
      }
    }
    return (interest) => {
      Object.assign(interest, patch);
    };
  }
}
