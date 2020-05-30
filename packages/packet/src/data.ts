import { Decoder, Encodable, EncodableTlv, Encoder, EvDecoder, NNI } from "@ndn/tlv";

import { SigType, TT } from "./an";
import { Component } from "./component";
import { ImplicitDigest } from "./digest-comp";
import { Name, NameLike } from "./name";
import { sha256 } from "./platform/mod";
import { SigInfo } from "./sig-info";
import { LLSign, LLVerify, Signer, Verifier } from "./signing";

const FAKE_SIGINFO = new SigInfo(SigType.Sha256);
const FAKE_SIGVALUE = new Uint8Array(32);
const FIELDS = Symbol("Data.FIELDS");

class Fields {
  constructor(...args: Array<Data | Data.CtorArg>) {
    args.forEach((arg) => {
      if (Name.isNameLike(arg)) {
        this.name = new Name(arg);
      } else if (arg instanceof Uint8Array) {
        this.content = arg;
      } else if (arg instanceof ContentTypeTag) {
        this.contentType = arg.v;
      } else if (arg instanceof FreshnessPeriodTag) {
        this.freshnessPeriod = arg.v;
      } else if (arg === Data.FinalBlock) {
        this.isFinalBlock = true;
      } else if (arg instanceof Data) {
        Object.assign(this, arg[FIELDS]);
      } else {
        throw new Error("unknown Data constructor argument");
      }
    });
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
  public sigInfo?: SigInfo;
  public sigValue?: Uint8Array;

  private contentType_ = 0;
  private freshnessPeriod_ = 0;

  public signedPortion?: Uint8Array;
  public topTlv?: Uint8Array;
  public topTlvDigest?: Uint8Array;
}
const FIELD_LIST: Array<keyof Fields> = ["name", "contentType", "freshnessPeriod", "finalBlockId", "isFinalBlock", "content", "sigInfo", "sigValue"];

const EVD = new EvDecoder<Fields>("Data", TT.Data)
  .setTop((t, { tlv }) => t.topTlv = tlv)
  .add(TT.Name, (t, { decoder }) => t.name = decoder.decode(Name), { required: true })
  .add(TT.MetaInfo,
    new EvDecoder<Fields>("MetaInfo")
      .add(TT.ContentType, (t, { nni }) => t.contentType = nni)
      .add(TT.FreshnessPeriod, (t, { nni }) => t.freshnessPeriod = nni)
      .add(TT.FinalBlockId, (t, { vd }) => t.finalBlockId = vd.decode(Component)),
  )
  .add(TT.Content, (t, { value }) => t.content = value)
  .add(TT.DSigInfo, (t, { decoder }) => {
    t.sigInfo = decoder.decode(SigInfo);
  }, { required: true })
  .add(TT.DSigValue, (t, { value, before }) => {
    t.sigValue = value;
    t.signedPortion = before;
  }, { required: true });

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
        [TT.DSigValue, f.sigValue ?? FAKE_SIGVALUE],
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
        f.finalBlockId ? [TT.FinalBlockId, f.finalBlockId] : undefined,
      ],
      f.content.byteLength > 0 ? [TT.Content, f.content] : undefined,
      (f.sigInfo ?? FAKE_SIGINFO).encodeAs(TT.DSigInfo),
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

class ContentTypeTag {
  constructor(public v: number) {
  }
}

class FreshnessPeriodTag {
  constructor(public v: number) {
  }
}

export namespace Data {
  export function ContentType(v: number): ContentTypeTag {
    return new ContentTypeTag(v);
  }

  export function FreshnessPeriod(v: number): FreshnessPeriodTag {
    return new FreshnessPeriodTag(v);
  }

  export const FinalBlock = Symbol("FinalBlock");

  export type CtorArg = NameLike | ContentTypeTag | FreshnessPeriodTag |
                        typeof FinalBlock | Uint8Array;
}
