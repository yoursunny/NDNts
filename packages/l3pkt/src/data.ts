import { Component, Name, NameLike } from "@ndn/name";
import { Decoder, Encodable, Encoder, EvDecoder, NNI } from "@ndn/tlv";

import { SigType, TT } from "./an";
import { LLSign, LLVerify } from "./llsign";
import { DSigInfo } from "./sig-info";

const FAKE_SIGINFO = (() => {
  const sigInfo = new DSigInfo();
  sigInfo.type = SigType.Sha256;
  return sigInfo;
})();
const FAKE_SIGVALUE = new Uint8Array(32);

const EVD = new EvDecoder<Data>("Data", TT.Data)
.add(TT.Name, (self, { decoder }) => self.name = decoder.decode(Name))
.add(TT.MetaInfo,
  new EvDecoder<Data>("MetaInfo")
  .add(TT.ContentType, (self, { value }) => self.contentType = NNI.decode(value))
  .add(TT.FreshnessPeriod, (self, { value }) => self.freshnessPeriod = NNI.decode(value))
  .add(TT.FinalBlockId, (self, { vd }) => self.finalBlockId = vd.decode(Component)),
)
.add(TT.Content, (self, { value }) => self.content = value)
.add(TT.DSigInfo, (self, { decoder }) => self.sigInfo = decoder.decode(DSigInfo))
.add(TT.DSigValue, (self, { value, before }) => {
  self.sigValue = value;
  self[LLVerify.SIGNED] = before;
});

/** Data packet. */
export class Data {
  public get contentType() { return this.contentType_; }
  public set contentType(v) { this.contentType_ = NNI.constrain(v, "ContentType"); }

  public get freshnessPeriod() { return this.freshnessPeriod_; }
  public set freshnessPeriod(v) { this.freshnessPeriod_ = NNI.constrain(v, "FreshnessPeriod"); }

  public get isFinalBlock(): boolean {
    return !!this.finalBlockId &&
           this.name.size > 0 &&
           this.finalBlockId.equals(this.name.at(-1));
  }

  public set isFinalBlock(v: boolean) {
    if (!v) {
      this.finalBlockId = undefined;
      return;
    }
    if (this.name.size < 1) {
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
  public sigInfo: DSigInfo = FAKE_SIGINFO;
  public sigValue: Uint8Array = FAKE_SIGVALUE;
  public [LLSign.PENDING]?: LLSign;
  public [LLVerify.SIGNED]?: Uint8Array;

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
    encoder.prependTlv(TT.Data,
      ...this.getSignedPortion(),
      [TT.DSigValue, this.sigValue],
    );
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
      this.sigInfo,
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
