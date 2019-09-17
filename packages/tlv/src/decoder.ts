import printf from "printf";

export interface Decodable<R> {
  decodeFrom(decoder: Decoder): R;
}

class DecodedTlv {
  public get type(): number {
    return this.type_;
  }

  public get length(): number {
    return this.buf.length - this.offsetV;
  }

  public get value(): Uint8Array {
    return this.buf.subarray(this.offsetV);
  }

  public get tlv(): Uint8Array {
    return this.buf;
  }

  public get size(): number {
    return this.buf.length;
  }

  public get decoder(): Decoder {
    return new Decoder(this.buf);
  }

  public get vd(): Decoder {
    return new Decoder(this.value);
  }

  constructor(private type_: number, private offsetV: number, private buf: Uint8Array) {
  }
}

/** TLV decoder. */
export class Decoder {
  /** Determine whether end of input has been reached. */
  public get eof(): boolean {
    return this.offset >= this.input.length;
  }

  private offset: number = 0;

  constructor(private input: Uint8Array) {
    if (Buffer.isBuffer(input)) {
      this.input = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
  }

  /** Read TLV structure. */
  public read(): Decoder.Tlv {
    const offset0 = this.offset;
    const type = this.readType();
    const length = this.readLength();
    const offset1 = this.offset;
    this.skipValue(length);
    return new DecodedTlv(type, offset1 - offset0, this.input.subarray(offset0, this.offset));
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

  private readType(): number {
    const n = this.readVarNum();
    if (typeof n === "undefined") {
      throw new Error(printf("TLV-TYPE is missing near offset %d", this.offset));
    }
    return n;
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
    readonly tlv: Uint8Array;
    readonly size: number;
    readonly decoder: Decoder;
    readonly vd: Decoder;
  }
}
