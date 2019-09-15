import { Name, NameLike } from "@ndn/name";
import { Decoder, Encoder, EvDecoder, NNI } from "@ndn/tlv";
import { TT } from "@ndn/tt-base";

const FAKESIG = new Uint8Array([
  TT.DSigInfo, 0x03,
  TT.SigType, 0x01, 0x00,
  TT.DSigValue, 0x20,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

/** Data packet. */
export class Data {
  public get name(): Name {
    return this.name_;
  }

  public set name(v: Name) {
    this.name_ = v;
  }

  public get freshnessPeriod(): number {
    return this.freshnessPeriod_;
  }

  public set freshnessPeriod(v: number) {
    if (v < 0) {
      throw new Error("FreshnessPeriod must be non-negative");
    }
    this.freshnessPeriod_ = v;
  }

  public get content(): Uint8Array {
    return this.content_;
  }

  public set content(v: Uint8Array) {
    this.content_ = v;
  }

  public static decodeFrom(decoder: Decoder): Data {
    const self = new Data();
    Data.EVD.decode(self, decoder);
    return self;
  }

  private static readonly EVD = new EvDecoder<Data>(TT.Data, [
    { tt: TT.Name, cb: (self, { decoder }) => { self.name_ = decoder.decode(Name); } },
    { tt: TT.MetaInfo, cb: EvDecoder.Nest(new EvDecoder<Data>(TT.MetaInfo, [
      { tt: TT.FreshnessPeriod, cb: (self, { value }) => { self.freshnessPeriod = NNI.decode(value); } },
    ])) },
    { tt: TT.Content, cb: (self, { value }) => { self.content_ = value; } },
    { tt: TT.DSigInfo, cb: () => undefined },
    { tt: TT.DSigValue, cb: () => undefined },
  ]);

  private name_: Name = new Name();
  private freshnessPeriod_: number = 0; // millis
  private content_: Uint8Array = new Uint8Array();

  /**
   * Construct from flexible arguments.
   *
   * Arguments can include, in any order:
   * - Name or name URI
   * - Data.FreshnessPeriod(v)
   * - Uint8Array as Content
   */
  constructor(...args: Data.CtorArg[]) {
    args.forEach((arg) => {
      if (Name.isNameLike(arg)) {
        this.name_ = new Name(arg);
      } else if (arg instanceof FreshnessPeriodTag) {
        this.freshnessPeriod = arg.v; // assign via setter for bounds checking
      } else if (arg instanceof Uint8Array) {
        this.content_ = arg;
      } else {
        throw new Error("unknown Data constructor argument");
      }
    });
  }

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(TT.Data,
      this.name_,
      this.freshnessPeriod_ > 0 ?
        [TT.MetaInfo, [TT.FreshnessPeriod, NNI(this.freshnessPeriod_)]] :
        undefined,
      this.content_.byteLength > 0 ? [TT.Content, this.content_] : undefined,
      FAKESIG,
    );
  }
}

class FreshnessPeriodTag {
  constructor(public v: number) {
  }
}

export namespace Data {
  export function FreshnessPeriod(v: number): FreshnessPeriodTag {
    return new FreshnessPeriodTag(v);
  }

  export type CtorArg = NameLike | FreshnessPeriodTag | Uint8Array;
}
