import { Component, Name, NameLike } from "@ndn/name";
import { Decoder, Encoder, EvDecoder, NNI } from "@ndn/tlv";

import { TT } from "./an";

const FAKESIG = new Uint8Array([
  TT.DSigInfo, 0x03,
  TT.SigType, 0x01, 0x00,
  TT.DSigValue, 0x20,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

const EVD = new EvDecoder<Data>("Data", TT.Data)
.add(TT.Name, (self, { decoder }) => { self.name = decoder.decode(Name); })
.add(TT.MetaInfo,
  new EvDecoder<Data>("MetaInfo")
  .add(TT.ContentType, (self, { value }) => { self.contentType = NNI.decode(value); })
  .add(TT.FreshnessPeriod, (self, { value }) => { self.freshnessPeriod = NNI.decode(value); })
  .add(TT.FinalBlockId, (self, { vd }) => { self.finalBlockId = Component.decodeFrom(vd); }),
)
.add(TT.Content, (self, { value }) => { self.content = value; })
.add(TT.DSigInfo, () => undefined)
.add(TT.DSigValue, () => undefined);

/** Data packet. */
export class Data {
  public get name() { return this.name_; }
  public set name(v) { this.name_ = v; }

  public get contentType() { return this.contentType_; }
  public set contentType(v) { this.contentType_ = NNI.constrain(v, "ContentType"); }

  public get freshnessPeriod() { return this.freshnessPeriod_; }
  public set freshnessPeriod(v) { this.freshnessPeriod_ = NNI.constrain(v, "FreshnessPeriod"); }

  public get finalBlockId() { return this.finalBlockId_; }
  public set finalBlockId(v) { this.finalBlockId_ = v; }

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

  public get content() { return this.content_; }
  public set content(v) { this.content_ = v; }

  public static decodeFrom(decoder: Decoder): Data {
    return EVD.decode(new Data(), decoder);
  }

  private name_: Name = new Name();
  private contentType_: number = 0;
  private freshnessPeriod_: number = 0;
  private finalBlockId_: Component|undefined;
  private content_: Uint8Array = new Uint8Array();

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
    encoder.prependTlv(TT.Data,
      this.name,
      [
        TT.MetaInfo, Encoder.OmitEmpty,
        this.contentType > 0 ? [TT.ContentType, NNI(this.contentType)] : undefined,
        this.freshnessPeriod > 0 ? [TT.FreshnessPeriod, NNI(this.freshnessPeriod)] : undefined,
        this.finalBlockId ? [TT.FinalBlockId, this.finalBlockId] : undefined,
      ],
      this.content.byteLength > 0 ? [TT.Content, this.content] : undefined,
      FAKESIG,
    );
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
