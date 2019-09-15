import printf = require("printf");

export interface Decodable<R> {
  decodeFrom(decoder: Decoder): R;
}

class DecodedTlv {
  private type_: number;

  public get type(): number {
    return this.type_;
  }

  public get length(): number {
    return this.buf.byteLength - this.offsetV;
  }

  public get value(): Uint8Array {
    return this.buf.subarray(this.offsetV);
  }

  public get decoder(): Decoder {
    return new Decoder(this.buf);
  }

  public get vd(): Decoder {
    return new Decoder(this.value);
  }

  constructor(type: number, private offsetV: number, private buf: Uint8Array) {
    this.type_ = type;
  }
}

/**
 * TLV decoder.
 */
export class Decoder {
  /**
   * Determine whether end of input has been reached.
   */
  public get eof(): boolean {
    return this.offset >= this.input.length;
  }

  private offset: number;

  constructor(private input: Uint8Array) {
    this.offset = 0;
  }

  /** Read TLV structure. */
  public readTlv(): Decoder.Tlv {
    const offset0 = this.offset;
    const type = this.readType();
    const length = this.readLength();
    const offset1 = this.offset;
    this.skipValue(length);
    return new DecodedTlv(type, offset1 - offset0, this.input.subarray(offset0, this.offset));
  }

  /**
   * Read TLV-TYPE.
   * @deprecated use readTlv()
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
        throw new Error(printf("TLV-TYPE is unexpected near offset %d, should be %d",
                               this.offset, expect));
      }
      return n;
    }

    const accepts = args as number[];
    if (!accepts.includes(n)) {
      throw new Error("TLV-TYPE is unexpected, should be " +
                      accepts.map((tt) => printf("0x%02X", tt)).join(" or "));
    }
    return n;
  }

  /**
   * Read TLV-LENGTH and TLV-VALUE.
   * @returns TLV-VALUE
   * @deprecated use readTlv()
   */
  public readValue(): Uint8Array {
    const length = this.readLength();
    this.skipValue(length);
    return this.input.subarray(this.offset - length, this.offset);
  }

  /** Create a Decoder for TLV-VALUE. */
  public createValueDecoder(): Decoder {
    return new Decoder(this.readValue());
  }

  /** Read a Decodable object. */
  public decode<R>(d: Decodable<R>): R {
    return d.decodeFrom(this);
  }

  private readVarNum(): number|undefined {
    if (this.eof) {
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

  private readLength(): number {
    const n = this.readVarNum();
    if (typeof n === "undefined") {
      throw new Error(printf("TLV-LENGTH is missing near offset %d", this.offset));
    }
    return n;
  }

  private skipValue(length: number) {
    this.offset += length;
    if (this.offset > this.input.length) {
      throw new Error(printf("TLV-VALUE is incomplete near offset %d", this.offset));
    }
  }
}

/* istanbul ignore next */
export namespace Decoder {
  /** Types acceptable to Decoder.from(). */
  export type Input = Decoder | Uint8Array;

  /** Test whether obj is Decoder.Input. */
  export function isInput(obj: any): obj is Input {
    return obj instanceof Decoder || obj instanceof Uint8Array;
  }

  /** Construct from Decoder.Input, or return existing Decoder. */
  export function from(obj: Input): Decoder {
    if (obj instanceof Decoder) {
      return obj;
    }
    if (obj instanceof Uint8Array) {
      return new Decoder(obj);
    }
    throw new Error("Decoder.from: obj is not Decoder.Input");
  }

  /** Decoded TLV. */
  export interface Tlv {
    readonly type: number;
    readonly length: number;
    readonly value: Uint8Array;
    readonly decoder: Decoder;
    readonly vd: Decoder;
  }
}
