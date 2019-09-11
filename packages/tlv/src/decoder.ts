/**
 * Streaming TLV decoder.
 */
export class Decoder {
  private input: Uint8Array;
  private offset: number;

  constructor(input: Uint8Array) {
    this.input = input;
    this.offset = 0;
  }

  private readVarNum(): number|undefined {
    if (this.offset >= this.input.length) {
      return undefined;
    }
    switch (this.input[this.offset]) {
      case 0xFD:
        this.offset += 3;
        if (this.offset > this.input.length) {
          return undefined;
        }
        return this.input[this.offset - 2] * 0x100 +
               this.input[this.offset - 1];
      case 0xFE:
        this.offset += 5;
        if (this.offset > this.input.length) {
          return undefined;
        }
        return this.input[this.offset - 4] * 0x1000000 +
               this.input[this.offset - 3] * 0x10000 +
               this.input[this.offset - 2] * 0x100 +
               this.input[this.offset - 1];
      case 0xFF:
        // JavaScript cannot reliably represent 64-bit integers
        return undefined;
      default:
        this.offset += 1;
        return this.input[this.offset - 1];
    }
  }

  /**
   * Read TLV-TYPE.
   */
  public readType(): number|undefined {
    return this.readVarNum();
  }

  /**
   * Read TLV-LENGTH and TLV-VALUE.
   * @returns TLV-VALUE
   */
  public readValue(): Uint8Array|undefined {
    const length = this.readVarNum();
    if (typeof length === "undefined") {
      return undefined;
    }
    this.offset += length;
    if (this.offset > this.input.length) {
      return undefined;
    }
    return this.input.subarray(this.offset - length, this.offset);
  }
}
