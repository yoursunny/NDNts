import { Decoder } from "./decoder";

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
  constructor(wire: Uint8Array);

  /**
   * Create TLV with TLV-TYPE and TLV-VALUE.
   */
  constructor(type: number, value?: Uint8Array);

  constructor(arg1?, arg2?) {
    if (arg1 instanceof Uint8Array) {
      const decoder = new Decoder(arg1);
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

  public get value(): Uint8Array {
    return this.value_;
  }
}
