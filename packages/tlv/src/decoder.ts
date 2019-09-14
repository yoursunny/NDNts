import printf = require("printf");

export interface Decodable<R> {
  decodeFrom(decoder: Decoder): R;
}

/**
 * TLV decoder.
 */
export class Decoder {
  /**
   * Determine whether end of input has been reached.
   */
  public get eof(): boolean {
    return this.offset_ >= this.input_.length;
  }

  private input_: Uint8Array;
  private offset_: number;

  constructor(input: Uint8Array) {
    this.input_ = input;
    this.offset_ = 0;
  }

  /**
   * Read TLV-TYPE.
   */
  public readType(): number {
    const n = this.readVarNum();
    if (typeof n === "undefined") {
      throw new Error("TLV-TYPE is missing");
    }
    return n;
  }

  /**
   * Read TLV-TYPE with expected numbers.
   * @param accepts acceptable numbers.
   * @throws TLV-TYPE is not in accepts.
   */
  public readTypeExpect(...accepts: number[]): number;

  /**
   * Read TLV-TYPE with expected numbers.
   * @param accept accept function.
   * @throws accept(TLV-TYPE) is false.
   */
  public readTypeExpect(accept: (n: number) => boolean, expect?: string): number;

  public readTypeExpect(...args): number {
    const n = this.readType();

    if (typeof args[0] === "function") {
      const accept: (n: number) => boolean = args[0];
      const expect: string = args[1] || "a specific type";
      if (!accept(n)) {
        throw new Error("TLV-TYPE is unexpected, should be " + expect);
      }
      return n;
    }

    const accepts = args as number[];
    if (!accepts.includes(n)) {
      throw new Error("TLV-TYPE is unexpected, should be one of " +
                      accepts.map((tt) => printf("0x%02X", tt)));
    }
    return n;
  }

  /**
   * Read TLV-LENGTH and TLV-VALUE.
   * @returns TLV-VALUE
   */
  public readValue(): Uint8Array {
    const length = this.readVarNum();
    if (typeof length === "undefined") {
      throw new Error("TLV-LENGTH is missing");
    }
    this.offset_ += length;
    if (this.offset_ > this.input_.length) {
      throw new Error("TLV-VALUE is incomplete");
    }
    return this.input_.subarray(this.offset_ - length, this.offset_);
  }

  /**
   * Create a Decoder for TLV-VALUE.
   */
  public createValueDecoder(): Decoder {
    return new Decoder(this.readValue());
  }

  /**
   * Read a Decodable object.
   */
  public decode<R>(d: Decodable<R>): R {
    return d.decodeFrom(this);
  }

  private readVarNum(): number|undefined {
    if (this.eof) {
      return undefined;
    }
    switch (this.input_[this.offset_]) {
      case 0xFD:
        this.offset_ += 3;
        if (this.offset_ > this.input_.length) {
          return undefined;
        }
        return this.input_[this.offset_ - 2] * 0x100 +
               this.input_[this.offset_ - 1];
      case 0xFE:
        this.offset_ += 5;
        if (this.offset_ > this.input_.length) {
          return undefined;
        }
        return this.input_[this.offset_ - 4] * 0x1000000 +
               this.input_[this.offset_ - 3] * 0x10000 +
               this.input_[this.offset_ - 2] * 0x100 +
               this.input_[this.offset_ - 1];
      case 0xFF:
        // JavaScript cannot reliably represent 64-bit integers
        return undefined;
      default:
        this.offset_ += 1;
        return this.input_[this.offset_ - 1];
    }
  }
}

/* istanbul ignore next */
export namespace Decoder {
  /**
   * Types acceptable to Decoder.from().
   */
  export type Input = Decoder | Uint8Array;

  /**
   * Test whether obj is Decoder.Input.
   */
  export function isInput(obj: any): obj is Input {
    return obj instanceof Decoder || obj instanceof Uint8Array;
  }

  /**
   * Construct from Decoder.Input, or return existing Decoder.
   */
  export function from(obj: Input): Decoder {
    if (obj instanceof Decoder) {
      return obj;
    }
    if (obj instanceof Uint8Array) {
      return new Decoder(obj);
    }
    throw new Error("Decoder.from: obj is not Decoder.Input");
  }
}
