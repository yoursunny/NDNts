import { Decoder, Encodable, EncodableTlv, Encoder, EvDecoder, NNI } from "@ndn/tlv";

import { SigType, TT } from "./an";
import { Component } from "./component";
import { ImplicitDigest } from "./digest-comp";
import { LLSign, LLVerify } from "./llsign";
import { Name, NameLike } from "./name";
import { sha256 } from "./platform/mod";
import { SigInfo } from "./sig-info";

const FAKE_SIGINFO = new SigInfo(SigType.Sha256);
const FAKE_SIGVALUE = new Uint8Array(32);
const TopTlv = Symbol("Data.TopTlv");
const TopTlvDigest = Symbol("Data.TopTlvDigest");
const SignedPortion = Symbol("Data.SignedPortion");

const EVD = new EvDecoder<Data>("Data", TT.Data)
  .setTop((t, { tlv }) => t[TopTlv] = tlv)
  .add(TT.Name, (t, { decoder }) => t.name = decoder.decode(Name), { required: true })
  .add(TT.MetaInfo,
    new EvDecoder<Data>("MetaInfo")
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
    t[SignedPortion] = before;
  }, { required: true });

/** Data packet. */
export class Data {
  public get contentType() { return this.contentType_; }
  public set contentType(v) { this.contentType_ = NNI.constrain(v, "ContentType"); }

  public get freshnessPeriod() { return this.freshnessPeriod_; }
  public set freshnessPeriod(v) { this.freshnessPeriod_ = NNI.constrain(v, "FreshnessPeriod"); }

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

  public static decodeFrom(decoder: Decoder): Data {
    return EVD.decode(new Data(), decoder);
  }

  public name: Name = new Name();
  public finalBlockId?: Component;
  public content: Uint8Array = new Uint8Array();
  public sigInfo?: SigInfo;
  public sigValue?: Uint8Array;
  public [SignedPortion]?: Uint8Array;
  public [TopTlv]?: Uint8Array & {[TopTlvDigest]?: Uint8Array}; // for implicit digest

  private contentType_ = 0;
  private freshnessPeriod_ = 0;

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
        Object.assign(this, arg);
      } else {
        throw new Error("unknown Data constructor argument");
      }
    });
  }

  public encodeTo(encoder: Encoder) {
    encoder.encode(Encoder.extract(
      [
        TT.Data,
        Encoder.extract(
          this.encodeSignedPortion(),
          (output) => this[SignedPortion] = output,
        ),
        [TT.DSigValue, this.sigValue ?? FAKE_SIGVALUE],
      ] as EncodableTlv,
      (output) => this[TopTlv] = output,
    ));
  }

  private encodeSignedPortion(): Encodable[] {
    return [
      this.name,
      [
        TT.MetaInfo, Encoder.OmitEmpty,
        this.contentType > 0 ? [TT.ContentType, NNI(this.contentType)] : undefined,
        this.freshnessPeriod > 0 ? [TT.FreshnessPeriod, NNI(this.freshnessPeriod)] : undefined,
        this.finalBlockId ? [TT.FinalBlockId, this.finalBlockId] : undefined,
      ],
      this.content.byteLength > 0 ? [TT.Content, this.content] : undefined,
      (this.sigInfo ?? FAKE_SIGINFO).encodeAs(TT.DSigInfo),
    ];
  }

  public getImplicitDigest(): Uint8Array|undefined {
    return this[TopTlv]?.[TopTlvDigest];
  }

  public async computeImplicitDigest(): Promise<Uint8Array> {
    let digest = this.getImplicitDigest();
    if (!digest) {
      if (!this[TopTlv]) {
        Encoder.encode(this);
      }
      digest = await sha256(this[TopTlv]!);
      this[TopTlv]![TopTlvDigest] = digest;
    }
    return digest;
  }

  public getFullName(): Name|undefined {
    const digest = this.getImplicitDigest();
    if (!digest) {
      return undefined;
    }
    return this.name.append(ImplicitDigest, digest);
  }

  public async computeFullName(): Promise<Name> {
    await this.computeImplicitDigest();
    return this.getFullName()!;
  }

  public async [LLSign.OP](sign: LLSign) {
    const signedPortion = Encoder.encode(this.encodeSignedPortion());
    this[SignedPortion] = signedPortion;
    this.sigValue = await sign(signedPortion);
  }

  public async [LLVerify.OP](verify: LLVerify) {
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

  /** Obtain original encoding. */
  export function getWire(data: Data): Uint8Array {
    const wire = data[TopTlv];
    if (!wire) {
      throw new Error("wire encoding unavailable");
    }
    return wire;
  }
}
