import { NNI } from "./mod";

export interface Decodable<R> {
  decodeFrom(decoder: Decoder): R;
}

const textDecoder = new TextDecoder(); // keep instance due to https://github.com/nodejs/node/issues/32424

class DecodedTlv {
  public get length(): number {
    return this.offsetE - this.offsetV;
  }

  public get value(): Uint8Array {
    return this.buf.subarray(this.offsetV, this.offsetE);
  }

  public get tlv(): Uint8Array {
    return this.buf.subarray(this.offsetT, this.offsetE);
  }

  public get size(): number {
    return this.offsetE - this.offsetT;
  }

  public get decoder(): Decoder {
    return new Decoder(this.tlv);
  }

  public get vd(): Decoder {
    return new Decoder(this.value);
  }

  public get nni(): number {
    return NNI.decode(this.value);
  }

  public get text(): string {
    return textDecoder.decode(this.value);
  }

  public get before(): Uint8Array {
    return this.buf.subarray(0, this.offsetT);
  }

  public get after(): Uint8Array {
    return this.buf.subarray(this.offsetE);
  }

  constructor(public readonly type: number, private buf: Uint8Array,
      private offsetT: number, private offsetV: number, private offsetE: number) {
  }
}

/** TLV decoder. */
export class Decoder {
  /** Determine whether end of input has been reached. */
  public get eof(): boolean {
    return this.offset >= this.input.length;
  }

  private offset = 0;

  constructor(private input: Uint8Array) {
  }

  /** Read TLV structure. */
  public read(): Decoder.Tlv {
    const offsetT = this.offset;
    const type = this.readType();
    const length = this.readLength();
    const offsetV = this.offset;
    this.skipValue(length);
    const offsetE = this.offset;
    return new DecodedTlv(type, this.input, offsetT, offsetV, offsetE);
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
      throw new Error(`TLV-TYPE is missing near offset ${this.offset}`);
    }
    return n;
  }

  private readLength(): number {
    const n = this.readVarNum();
    if (typeof n === "undefined") {
      throw new Error(`TLV-LENGTH is missing near offset ${this.offset}`);
    }
    return n;
  }

  private skipValue(length: number) {
    this.offset += length;
    if (this.offset > this.input.length) {
      throw new Error(`TLV-VALUE is incomplete near offset ${this.offset}`);
    }
  }
}

export namespace Decoder {
  /** Types acceptable to Decoder.from(). */
  export type Input = Decoder | Uint8Array;

  /** Test whether obj is Decoder.Input. */
  export function isInput(obj: unknown): obj is Input {
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
    /** TLV-TYPE */
    readonly type: number;
    /** TLV-LENGTH */
    readonly length: number;
    /** TLV-VALUE */
    readonly value: Uint8Array;
    /** TLV buffer */
    readonly tlv: Uint8Array;
    /** sizeof tlv */
    readonly size: number;
    /** TLV as decoder */
    readonly decoder: Decoder;
    /** TLV-VALUE as decoder */
    readonly vd: Decoder;
    /** TLV-VALUE as non-negative integer */
    readonly nni: number;
    /** TLV-VALUE as UTF-8 string */
    readonly text: string;
    /** siblings before this TLV */
    readonly before: Uint8Array;
    /** siblings after this TLV */
    readonly after: Uint8Array;
  }
}
