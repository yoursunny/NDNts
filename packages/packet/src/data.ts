import { type Decoder, type Encodable, type EncodableTlv, Encoder, EvDecoder, NNI } from "@ndn/tlv";
import { constrain, sha256 } from "@ndn/util";
import type { Except } from "type-fest";

import { TT } from "./an";
import { definePublicFields, FIELDS } from "./impl-public-fields";
import type { Interest } from "./interest";
import { Component, ImplicitDigest, Name, type NameLike } from "./name/mod";
import { LLSign, LLVerify, type Signer, type Verifier } from "./security/signing";
import { SigInfo } from "./sig-info";

class Fields {
  constructor(...args: Array<Data | Data.CtorArg>) {
    let isFinalBlock = false;
    for (const arg of args) {
      if (Name.isNameLike(arg)) {
        this.name = Name.from(arg);
      } else if (arg instanceof Uint8Array) {
        this.content = arg;
      } else if (arg === Data.FinalBlock) {
        isFinalBlock = true;
      } else if (arg instanceof Data) {
        Object.assign(this, arg[FIELDS]);
      } else if (arg[ctorAssign]) {
        arg[ctorAssign](this);
      } else {
        throw new Error("unknown Data constructor argument");
      }
    }
    this.isFinalBlock = isFinalBlock;
  }

  public name = new Name();

  public get contentType() { return this.contentType_; }
  public set contentType(v) { this.contentType_ = constrain(v, "ContentType"); }
  private contentType_ = 0;

  public get freshnessPeriod() { return this.freshnessPeriod_; }
  public set freshnessPeriod(v) { this.freshnessPeriod_ = constrain(Math.trunc(v), "FreshnessPeriod"); }
  private freshnessPeriod_ = 0;

  public finalBlockId?: Component;

  /** Determine whether FinalBlockId equals the last name component. */
  public get isFinalBlock(): boolean {
    return !!this.finalBlockId && this.name.length > 0 &&
           this.finalBlockId.equals(this.name.get(-1)!);
  }

  /**
   * Setting to false deletes FinalBlockId.
   *
   * Setting to true assigns FinalBlockId to be the last name component.
   * It is not allowed if the name is empty.
   */
  public set isFinalBlock(v: boolean) {
    if (!v) {
      this.finalBlockId = undefined;
      return;
    }
    if (this.name.length === 0) {
      throw new Error("cannot set FinalBlockId when Name is empty");
    }
    this.finalBlockId = this.name.get(-1)!;
  }

  public content = new Uint8Array();
  public sigInfo = new SigInfo();
  public sigValue = new Uint8Array();

  public signedPortion?: Uint8Array;
  public topTlv?: Uint8Array;
  public topTlvDigest?: Uint8Array;
}
interface PublicFields extends Except<Fields, "signedPortion" | "topTlv" | "topTlvDigest"> {}

const EVD = new EvDecoder<Fields>("Data", TT.Data)
  .add(TT.Name, (t, { decoder }) => t.name = decoder.decode(Name), { required: true })
  .add(TT.MetaInfo,
    new EvDecoder<Fields>("MetaInfo")
      .add(TT.ContentType, (t, { nni }) => t.contentType = nni)
      .add(TT.FreshnessPeriod, (t, { nni }) => t.freshnessPeriod = nni)
      .add(TT.FinalBlock, (t, { vd }) => t.finalBlockId = vd.decode(Component)),
  )
  .add(TT.Content, (t, { value }) => t.content = value)
  .add(TT.DSigInfo, (t, { decoder }) => t.sigInfo = decoder.decode(SigInfo), { required: true })
  .add(TT.DSigValue, (t, { value, before }) => {
    t.sigValue = value;
    t.signedPortion = before;
  }, { required: true });
EVD.beforeObservers.push((t, tlv) => t.topTlv = tlv!.tlv);

/** Data packet. */
export class Data implements LLSign.Signable, LLVerify.Verifiable, Signer.Signable, Verifier.Verifiable {
  /**
   * Construct from flexible arguments.
   *
   * Arguments can include, in any order unless otherwise specified:
   * - Data to copy from
   * - Name or name URI
   * - Data.ContentType(v)
   * - Data.FreshnessPeriod(v)
   * - Data.FinalBlock (must appear after Name)
   * - Uint8Array as Content
   */
  constructor(...args: Array<Data | Data.CtorArg>) {
    this[FIELDS] = new Fields(...args);
  }

  public readonly [FIELDS]: Fields;

  public static decodeFrom(decoder: Decoder): Data {
    const data = new Data();
    EVD.decode(data[FIELDS], decoder);
    return data;
  }

  public encodeTo(encoder: Encoder) {
    const f = this[FIELDS];
    if (f.topTlv) {
      encoder.encode(f.topTlv);
      return;
    }
    encoder.encode(Encoder.extract(
      [
        TT.Data,
        Encoder.extract(
          this.encodeSignedPortion(),
          (output) => f.signedPortion = output,
        ),
        [TT.DSigValue, f.sigValue],
      ] as EncodableTlv,
      (output) => f.topTlv = output,
    ));
  }

  private encodeSignedPortion(): Encodable[] {
    const { name, contentType, freshnessPeriod, finalBlockId, content, sigInfo } = this[FIELDS];
    return [
      name,
      [
        TT.MetaInfo, Encoder.OmitEmpty,
        contentType > 0 && [TT.ContentType, NNI(contentType)],
        freshnessPeriod > 0 && [TT.FreshnessPeriod, NNI(freshnessPeriod)],
        finalBlockId && [TT.FinalBlock, finalBlockId],
      ],
      content.length > 0 && [TT.Content, content],
      sigInfo.encodeAs(TT.DSigInfo),
    ];
  }

  /** Return the implicit digest if it's already computed. */
  public getImplicitDigest(): Uint8Array | undefined {
    return this[FIELDS].topTlvDigest;
  }

  /** Compute the implicit digest. */
  public async computeImplicitDigest(): Promise<Uint8Array> {
    let digest = this.getImplicitDigest();
    if (!digest) {
      const f = this[FIELDS];
      if (!f.topTlv) {
        Encoder.encode(this);
      }
      digest = await sha256(f.topTlv!);
      f.topTlvDigest = digest;
    }
    return digest;
  }

  /** Return the full name if the implicit digest is already computed. */
  public getFullName(): Name | undefined {
    const digest = this.getImplicitDigest();
    if (!digest) {
      return undefined;
    }
    return this[FIELDS].name.append(ImplicitDigest, digest);
  }

  /** Compute the full name (name plus implicit digest). */
  public async computeFullName(): Promise<Name> {
    await this.computeImplicitDigest();
    return this.getFullName()!;
  }

  /**
   * Determine if a Data can satisfy an Interest.
   * @param isCacheLookup if true, Data with zero FreshnessPeriod cannot satisfy Interest with MustBeFresh;
   *                      if false, this check does not apply.
   * @returns a Promise that will be resolved with the result.
   */
  public async canSatisfy(interest: Interest, { isCacheLookup = false }: Data.CanSatisfyOptions = {}): Promise<boolean> {
    if (isCacheLookup && interest.mustBeFresh && this.freshnessPeriod <= 0) {
      return false;
    }

    if (interest.canBePrefix ? interest.name.isPrefixOf(this.name) : interest.name.equals(this.name)) {
      return true;
    }

    if (interest.name.length === this.name.length + 1 && interest.name.get(-1)!.is(ImplicitDigest)) {
      const fullName = this.getFullName();
      if (!fullName) {
        return interest.name.equals(await this.computeFullName());
      }
      return interest.name.equals(fullName);
    }

    return false;
  }

  public async [LLSign.OP](sign: LLSign) {
    const signedPortion = Encoder.encode(this.encodeSignedPortion());
    this[FIELDS].signedPortion = signedPortion;
    this.sigValue = await sign(signedPortion);
  }

  public async [LLVerify.OP](verify: LLVerify) {
    const { signedPortion, sigValue } = this[FIELDS];
    if (!sigValue) {
      throw new Error("SigValue is missing");
    }
    if (!signedPortion) {
      throw new Error("SignedPortion is missing");
    }
    await verify(signedPortion, sigValue);
  }
}
export interface Data extends PublicFields {}
const clearingFields = ["topTlv", "topTlvDigest", "signedPortion"] as const;
definePublicFields<Data, Fields, PublicFields>(Data, {
  name: clearingFields,
  contentType: clearingFields,
  freshnessPeriod: clearingFields,
  finalBlockId: clearingFields,
  isFinalBlock: clearingFields,
  content: clearingFields,
  sigInfo: clearingFields,
  sigValue: clearingFields.slice(0, 2),
});

const ctorAssign = Symbol("Data.ctorAssign");
interface CtorTag {
  [ctorAssign]: (f: Fields) => void;
}

export namespace Data {
  /** Constructor argument to set ContentType field. */
  export function ContentType(v: number): CtorTag {
    return {
      [ctorAssign](f: Fields) { return f.contentType = v; },
    };
  }

  /** Constructor argument to set FreshnessPeriod field. */
  export function FreshnessPeriod(v: number): CtorTag {
    return {
      [ctorAssign](f: Fields) { return f.freshnessPeriod = v; },
    };
  }

  /** Constructor argument to set the current packet as FinalBlock. */
  export const FinalBlock = Symbol("Data.FinalBlock");

  /** Constructor argument. */
  export type CtorArg = NameLike | CtorTag | typeof FinalBlock | Uint8Array;

  /** Data.canSatisfy options. */
  export interface CanSatisfyOptions {
    /**
     * Whether the Interest-Data matching is in the context of cache lookup.
     * If true, Data with zero FreshnessPeriod cannot satisfy Interest with MustBeFresh.
     * If false, this check does not apply.
     * @default false
     */
    isCacheLookup?: boolean;
  }
}
