import { Decoder } from "./decoder";

export class Tlv {
  protected m_type: number = 0;
  protected m_value: Uint8Array;

  constructor(input?: Uint8Array|number) {
    if (typeof input === "number") {
      this.m_type = input;
      this.m_value = new Uint8Array();
    } else if (!input) {
      this.m_value = new Uint8Array();
    } else {
      const decoder = new Decoder(input);
      this.m_type = decoder.readType();
      this.m_value = decoder.readValue();
    }
  }

  public get type(): number {
    return this.m_type;
  }

  public get value(): Uint8Array {
    return this.m_value;
  }
}
