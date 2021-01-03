import { Decoder, Encodable, EncodableTlv, Encoder, EvDecoder, NNI } from "@ndn/tlv";

import { TT } from "./an";
import type { Interest } from "./interest";
import { Component, ImplicitDigest, Name, NameLike } from "./name/mod";
import { sha256 } from "./security/helper_node";
import { LLSign, LLVerify, Signer, Verifier } from "./security/signing";
import { SigInfo } from "./sig-info";

const FIELDS = Symbol("Data.FIELDS");

class Fields {
  constructor(...args: Array<Data | Data.CtorArg>) {
    let isFinalBlock = false;
    args.forEach((arg) => {
      if (Name.isNameLike(arg)) {
        this.name = new Name(arg);
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
    });
    this.isFinalBlock = isFinalBlock;
  }

  public get isFinalBlock(): boolean {
    return !!this.finalBlockId &&
           this.name.length > 0 &&
           this.finalBlockId.equals(this.name.at(-1));
  }

  public set isFinalBlock(v: boolean) {
    if (!v) {
      this.finalBlockId = undefined;
      return;
    }
    if (this.name.length === 0) {
      throw new Error("cannot set FinalBlockId when Name is empty");
    }
    this.finalBlockId = this.name.at(-1);
  }

  public name = new Name();
  public get contentType() { return this.contentType_; }
  public set contentType(v) { this.contentType_ = NNI.constrain(v, "ContentType"); }
  public get freshnessPeriod() { return this.freshnessPeriod_; }
  public set freshnessPeriod(v) { this.freshnessPeriod_ = NNI.constrain(v, "FreshnessPeriod"); }
  public finalBlockId?: Component;
  public content = new Uint8Array();
  public sigInfo = new SigInfo();
  public sigValue = new Uint8Array();

  private contentType_ = 0;
  private freshnessPeriod_ = 0;

  public signedPortion?: Uint8Array;
  public topTlv?: Uint8Array;
  public topTlvDigest?: Uint8Array;
}
const FIELD_LIST: Array<keyof Fields> = ["name", "contentType", "freshnessPeriod", "finalBlockId", "isFinalBlock", "content", "sigInfo", "sigValue"];

const EVD = new EvDecoder<Fields>("Data", TT.Data)
  .add(TT.Name, (t, { decoder }) => t.name = decoder.decode(Name), { required: true })
  .add(TT.MetaInfo,
    new EvDecoder<Fields>("MetaInfo")
      .add(TT.ContentType, (t, { nni }) => t.contentType = nni)
      .add(TT.FreshnessPeriod, (t, { nni }) => t.freshnessPeriod = nni)
      .add(TT.FinalBlock, (t, { vd }) => t.finalBlockId = vd.decode(Component)),
  )
  .add(TT.Content, (t, { value }) => t.content = value)
  .add(TT.DSigInfo, (t, { decoder }) => {
    t.sigInfo = decoder.decode(SigInfo);
  }, { required: true })
  .add(TT.DSigValue, (t, { value, before }) => {
    t.sigValue = value;
    t.signedPortion = before;
  }, { required: true });
EVD.beforeTopCallbacks.push((t, { tlv }) => t.topTlv = tlv);

/** Data packet. */
export class Data implements LLSign.Signable, LLVerify.Verifiable, Signer.Signable, Verifier.Verifiable {
  /**
   * Construct from flexible arguments.
   *
   * Arguments can include:
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
    const f = this[FIELDS];
    return [
      f.name,
      [
        TT.MetaInfo, Encoder.OmitEmpty,
        f.contentType > 0 ? [TT.ContentType, NNI(f.contentType)] : undefined,
        f.freshnessPeriod > 0 ? [TT.FreshnessPeriod, NNI(f.freshnessPeriod)] : undefined,
        f.finalBlockId ? [TT.FinalBlock, f.finalBlockId] : undefined,
      ],
      f.content.byteLength > 0 ? [TT.Content, f.content] : undefined,
      f.sigInfo.encodeAs(TT.DSigInfo),
    ];
  }

  public getImplicitDigest(): Uint8Array|undefined {
    return this[FIELDS].topTlvDigest;
  }

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

  public getFullName(): Name|undefined {
    const digest = this.getImplicitDigest();
    if (!digest) {
      return undefined;
    }
    return this[FIELDS].name.append(ImplicitDigest, digest);
  }

  public async computeFullName(): Promise<Name> {
    await this.computeImplicitDigest();
    return this.getFullName()!;
  }

  /**
   * Determine if a Data can satisfy an Interest.
   * @returns a Promise that will be resolved with the result.
   */
  public async canSatisfy(interest: Interest): Promise<boolean> {
    if (interest.mustBeFresh && this.freshnessPeriod <= 0) {
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
    const f = this[FIELDS];
    if (!f.sigValue) {
      throw new Error("SigValue is missing");
    }
    if (!f.signedPortion) {
      throw new Error("SignedPortion is missing");
    }
    await verify(f.signedPortion, f.sigValue);
  }
}
export interface Data extends Fields {}
for (const field of FIELD_LIST) {
  Object.defineProperty(Data.prototype, field, {
    enumerable: true,
    get(this: Data) { return this[FIELDS][field]; },
    set(this: Data, v: any) {
      const f = this[FIELDS];
      (f[field] as any) = v;
      f.topTlv = undefined;
      f.topTlvDigest = undefined;
      if (field !== "sigValue") {
        f.signedPortion = undefined;
      }
    },
  });
}

const ctorAssign = Symbol("Interest.ctorAssign");
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
  export const FinalBlock = Symbol("FinalBlock");

  /** Constructor argument. */
  export type CtorArg = NameLike | CtorTag | typeof FinalBlock | Uint8Array;
}
