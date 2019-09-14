import { Decoder } from "./decoder";
import { Encoder } from "./encoder";

/**
 * Type-Length-Value structure.
 */
export class Tlv {
  public get type(): number {
    return this.type_;
  }

  public get length(): number {
    return this.value_.length;
  }

  public get value(): Uint8Array {
    return this.value_;
  }

  public static decodeFrom(decoder: Decoder): Tlv {
    return Tlv.decodeFromImpl(decoder, new Tlv());
  }

  protected static decodeFromImpl<T extends Tlv>(decoder: Decoder, self: T): T {
    self.type_ = decoder.readType();
    self.value_ = decoder.readValue();
    return self;
  }

  protected type_: number;
  protected value_: Uint8Array;

  /**
   * Create empty TLV.
   */
  constructor();

  /**
   * Create TLV with TLV-TYPE and TLV-VALUE.
   */
  constructor(type: number, value?: Uint8Array);

  constructor(arg1?, arg2?) {
    if (typeof arg1 === "number") {
      this.type_ = arg1;
      this.value_ = arg2 || new Uint8Array();
    } else {
      this.type_ = 0;
      this.value_ = new Uint8Array();
    }
  }

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(this.type_, this.value_);
  }
}
