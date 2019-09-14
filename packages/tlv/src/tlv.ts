import { Decoder } from "./decoder";
import { Encoder } from "./encoder";

export class Tlv {
  protected type_: number;
  protected value_: Uint8Array;

  /**
   * Create empty TLV.
   */
  constructor();

  /**
   * Decode TLV.
   * @param wire wire encoding.
   */
  constructor(wire: Decoder.Input);

  /**
   * Create TLV with TLV-TYPE and TLV-VALUE.
   */
  constructor(type: number, value?: Uint8Array);

  constructor(arg1?, arg2?) {
    if (Decoder.isInput(arg1)) {
      const decoder = Decoder.from(arg1);
      this.type_ = decoder.readType();
      this.value_ = decoder.readValue();
    } else if (typeof arg1 === "number") {
      this.type_ = arg1;
      this.value_ = arg2 || new Uint8Array();
    } else {
      this.type_ = 0;
      this.value_ = new Uint8Array();
    }
  }

  public get type(): number {
    return this.type_;
  }

  public get length(): number {
    return this.value_.length;
  }

  public get value(): Uint8Array {
    return this.value_;
  }

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(this.type_, this.value_);
  }
}
