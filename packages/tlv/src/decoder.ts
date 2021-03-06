import { Encoder } from "./mod";
import { NNI } from "./nni";
import { fromUtf8 } from "./string";

export interface Decodable<R> {
  decodeFrom: (decoder: Decoder) => R;
}

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

  public get nniBig(): bigint {
    return NNI.decode(this.value, { big: true });
  }

  public get text(): string {
    return fromUtf8(this.value);
  }

  public get before(): Uint8Array {
    return this.buf.subarray(0, this.offsetT);
  }

  public get after(): Uint8Array {
    return this.buf.subarray(this.offsetE);
  }

  constructor(public readonly type: number, private readonly buf: Uint8Array,
      private readonly offsetT: number, private readonly offsetV: number, private readonly offsetE: number) {}
}

/** TLV decoder. */
export class Decoder {
  /** Determine whether end of input has been reached. */
  public get eof(): boolean {
    return this.offset >= this.input.length;
  }

  private readonly dv: DataView;
  private offset = 0;

  constructor(private readonly input: Uint8Array) {
    this.dv = Encoder.asDataView(input);
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

  private readVarNum(): number | undefined {
    if (this.eof) {
      return undefined;
    }
    switch (this.input[this.offset]) {
      case 0xFD:
        this.offset += 3;
        if (this.offset > this.input.length) {
          return undefined;
        }
        return this.dv.getUint16(this.offset - 2);
      case 0xFE:
        this.offset += 5;
        if (this.offset > this.input.length) {
          return undefined;
        }
        return this.dv.getUint32(this.offset - 4);
      case 0xFF:
        // JavaScript cannot reliably represent 64-bit integers
        return undefined;
      default:
        this.offset += 1;
        return this.input[this.offset - 1]!;
    }
  }

  private readType(): number {
    const n = this.readVarNum();
    if (n === undefined) {
      throw new Error(`TLV-TYPE is missing near offset ${this.offset}`);
    }
    return n;
  }

  private readLength(): number {
    const n = this.readVarNum();
    if (n === undefined) {
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
  /** Decoded TLV. */
  export interface Tlv {
    /** TLV-TYPE. */
    readonly type: number;
    /** TLV-LENGTH. */
    readonly length: number;
    /** TLV-VALUE. */
    readonly value: Uint8Array;
    /** TLV buffer. */
    readonly tlv: Uint8Array;
    /** Size of TLV. */
    readonly size: number;
    /** TLV as decoder. */
    readonly decoder: Decoder;
    /** TLV-VALUE as decoder. */
    readonly vd: Decoder;
    /** TLV-VALUE as non-negative integer. */
    readonly nni: number;
    /** TLV-VALUE as non-negative integer bigint. */
    readonly nniBig: bigint;
    /** TLV-VALUE as UTF-8 string. */
    readonly text: string;
    /** Siblings before this TLV. */
    readonly before: Uint8Array;
    /** Siblings after this TLV. */
    readonly after: Uint8Array;
  }
}
