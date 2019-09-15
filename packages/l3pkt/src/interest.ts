import { Name, NameLike } from "@ndn/name";
import { Decoder, Encoder, EvDecoder } from "@ndn/tlv";
import { TT } from "@ndn/tt-base";

/** Interest packet. */
export class Interest {
  public get name(): Name {
    return this.name_;
  }

  public set name(v: Name) {
    this.name_ = v;
  }

  public get canBePrefix(): boolean {
    return this.canBePrefix_;
  }

  public set canBePrefix(v: boolean) {
    this.canBePrefix_ = v;
  }

  public get mustBeFresh(): boolean {
    return this.mustBeFresh_;
  }

  public set mustBeFresh(v: boolean) {
    this.mustBeFresh_ = v;
  }

  public static decodeFrom(decoder: Decoder): Interest {
    const self = new Interest();
    Interest.EVD.decode(self, decoder);
    return self;
  }

  private static readonly EVD = new EvDecoder<Interest>(TT.Interest, [
    { tt: TT.Name, cb: (self, { decoder }) => { self.name_ = decoder.decode(Name); } },
    { tt: TT.CanBePrefix, cb: (self) => { self.canBePrefix_ = true; } },
    { tt: TT.MustBeFresh, cb: (self) => { self.mustBeFresh_ = true; } },
    // TODO ForwardingHint
    { tt: TT.Nonce, cb: () => undefined },
    { tt: TT.InterestLifetime, cb: () => undefined },
    { tt: TT.HopLimit, cb: () => undefined },
    // TODO AppParameters, ISigInfo, ISigValue
  ]);

  private name_: Name = new Name();
  private canBePrefix_: boolean = false;
  private mustBeFresh_: boolean = false;

  /**
   * Construct from flexible arguments.
   *
   * Arguments can include, in any order:
   * - Name or name URI
   * - Interest.CanBePrefix symbol
   * - Interest.MustBeFresh symbol
   */
  constructor(...args: Interest.CtorArg[]) {
    args.forEach((arg) => {
      if (Name.isNameLike(arg)) {
        this.name_ = new Name(arg);
      } else if (arg === Interest.CanBePrefix) {
        this.canBePrefix_ = true;
      } else if (arg === Interest.MustBeFresh) {
        this.mustBeFresh_ = true;
      } else {
        throw new Error("unknown Interest constructor argument");
      }
    });
  }

  public encodeTo(encoder: Encoder) {
    const nonce = Buffer.alloc(4);
    nonce.writeUInt32LE(Math.random() * 0x100000000, 0);

    encoder.prependTlv(TT.Interest,
      this.name_,
      this.canBePrefix_ ? [TT.CanBePrefix] : undefined,
      this.mustBeFresh_ ? [TT.MustBeFresh] : undefined,
      [TT.Nonce, nonce],
    );
  }
}

export namespace Interest {
  export const CanBePrefix = Symbol("CanBePrefix");
  export const MustBeFresh = Symbol("MustBeFresh");

  export type CtorArg = NameLike | typeof CanBePrefix | typeof MustBeFresh;
}
