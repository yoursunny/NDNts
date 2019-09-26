import { Component, ImplicitDigest, Name, NameLike } from "@ndn/name";
import { Decoder, Encodable, EncodableTlv, Encoder, EvDecoder, NNI } from "@ndn/tlv";

import { SigType, TT } from "./an";
import { LLSign, LLVerify } from "./llsign";
import { sha256 } from "./sha256";
import { SigInfo } from "./sig-info";

const FAKE_SIGINFO = new SigInfo(SigType.Sha256);
const FAKE_SIGVALUE = new Uint8Array(32);
const TOPTLV = Symbol("Data.TopTlv");

const EVD = new EvDecoder<Data>("Data", TT.Data)
.setTop((t, { tlv }) => t[TOPTLV] = tlv)
.add(TT.Name, (t, { decoder }) => t.name = decoder.decode(Name))
.add(TT.MetaInfo,
  new EvDecoder<Data>("MetaInfo")
  .add(TT.ContentType, (t, { nni }) => t.contentType = nni)
  .add(TT.FreshnessPeriod, (t, { nni }) => t.freshnessPeriod = nni)
  .add(TT.FinalBlockId, (t, { vd }) => t.finalBlockId = vd.decode(Component)),
)
.add(TT.Content, (t, { value }) => t.content = value)
.add(TT.DSigInfo, (t, { decoder }) => t.sigInfo = decoder.decode(SigInfo))
.add(TT.DSigValue, (t, { value, before }) => {
  t.sigValue = value;
  t[LLVerify.SIGNED] = before;
});

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
    if (this.name.length < 1) {
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
  public sigInfo: SigInfo = FAKE_SIGINFO;
  public sigValue: Uint8Array = FAKE_SIGVALUE;
  public [LLSign.PENDING]?: LLSign;
  public [LLVerify.SIGNED]?: Uint8Array;
  public [TOPTLV]?: Uint8Array; // for implicit digest

  private contentType_: number = 0;
  private freshnessPeriod_: number = 0;

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
    LLSign.encodeErrorIfPending(this);
    encoder.encode(Encoder.extract(
      [
        TT.Data,
        Encoder.extract(
          this.getSignedPortion(),
          (output) => this[LLVerify.SIGNED] = output,
        ),
        [TT.DSigValue, this.sigValue],
      ] as EncodableTlv,
      (output) => this[TOPTLV] = output,
    ));
  }

  public async computeImplicitDigest(): Promise<Uint8Array> {
    const topTlv = this[TOPTLV];
    if (!topTlv) {
      throw new Error("wire encoding is unavailable");
    }
    return sha256(topTlv);
  }

  public async getFullName(): Promise<Name> {
    const digest = await this.computeImplicitDigest();
    return this.name.append(ImplicitDigest, digest);
  }

  public [LLSign.PROCESS](): Promise<void> {
    return LLSign.processImpl(this,
      () => Encoder.encode(this.getSignedPortion()),
      (sig) => this.sigValue = sig);
  }

  public [LLVerify.VERIFY](verify: LLVerify): Promise<void> {
    return LLVerify.verifyImpl(this, this.sigValue, verify);
  }

  private getSignedPortion(): Encodable[] {
    return [
      this.name,
      [
        TT.MetaInfo, Encoder.OmitEmpty,
        this.contentType > 0 ? [TT.ContentType, NNI(this.contentType)] : undefined,
        this.freshnessPeriod > 0 ? [TT.FreshnessPeriod, NNI(this.freshnessPeriod)] : undefined,
        this.finalBlockId ? [TT.FinalBlockId, this.finalBlockId] : undefined,
      ],
      this.content.byteLength > 0 ? [TT.Content, this.content] : undefined,
      this.sigInfo.encodeAs(TT.DSigInfo),
    ];
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
}
