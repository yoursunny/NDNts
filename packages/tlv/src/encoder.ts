/**
 * An object that knows how to prepend itself to an Encoder.
 */
export interface EncodableObj {
  encodeTo(encoder: Encoder): void;
}

/**
 * An encodable TLV structure.
 *
 * First item is a number for TLV-TYPE.
 * Optional second item could be OmitEmpty to omit the TLV if TLV-VALUE is empty.
 * Subsequent items are Encodables for TLV-VALUE.
 */
export type EncodableTlv = [number, ...any[]];

/**
 * An object acceptable to Encoder.encode().
 */
export type Encodable = Uint8Array | undefined | EncodableObj | EncodableTlv;

function sizeofVarNum(n: number): number {
  if (n < 0xFD) {
    return 1;
  }
  if (n <= 0xFFFF) {
    return 3;
  }
  if (n <= 0xFFFFFFFF) {
    return 5;
  }
  // JavaScript cannot reliably represent 64-bit integers
  throw new Error("VAR-NUMBER is too large");
}

function writeVarNum(room: Uint8Array, off: number, n: number) {
  if (n < 0xFD) {
    room[off++] = n;
  } else if (n <= 0xFFFF) {
    room[off++] = 0xFD;
    Encoder.asDataView(room).setUint16(off, n);
  } else {
    room[off++] = 0xFE;
    Encoder.asDataView(room).setUint32(off, n);
  }
}

const BUF_INIT_SIZE = 2048;
const BUF_GROW_SIZE = 2048;

/** TLV encoder that accepts objects in reverse order. */
export class Encoder {
  private buf: ArrayBuffer;
  private off: number;

  /** Return encoding output size. */
  public get size(): number {
    return this.buf.byteLength - this.off;
  }

  /** Obtain encoding output. */
  public get output(): Uint8Array {
    return this.slice();
  }

  constructor(initSize: number = BUF_INIT_SIZE) {
    this.buf = new ArrayBuffer(initSize);
    this.off = initSize;
  }

  /** Obtain part of encoding output. */
  public slice(start: number = 0, length?: number) {
    if (typeof length === "undefined") {
      // iOS would interpret length=undefined as length=0, so we need a conditional
      return new Uint8Array(this.buf, this.off + start);
    }
    return new Uint8Array(this.buf, this.off + start, length);
  }

  /**
   * Make room to prepend an object.
   * @param sizeofObject object size.
   * @returns room to write object.
   */
  public prependRoom(sizeofObject: number): Uint8Array {
    if (this.off < sizeofObject) {
      this.grow(sizeofObject);
    }
    this.off -= sizeofObject;
    return this.slice(0, sizeofObject);
  }

  /** Prepend TLV-TYPE and TLV-LENGTH. */
  public prependTypeLength(tlvType: number, tlvLength: number) {
    const sizeofT = sizeofVarNum(tlvType);
    const sizeofL = sizeofVarNum(tlvLength);
    const room = this.prependRoom(sizeofT + sizeofL);
    writeVarNum(room, 0, tlvType);
    writeVarNum(room, sizeofT, tlvLength);
  }

  /** Prepend TLV-VALUE. */
  public prependValue(...tlvValue: Encodable[]) {
    for (let i = tlvValue.length - 1; i >= 0; --i) {
      this.encode(tlvValue[i]);
    }
  }

  /**
   * Prepend TLV structure.
   * @param tlvType TLV-TYPE number.
   * @param omitEmpty omit TLV altogether if set to Encoder.OmitEmpty
   * @param tlvValue TLV-VALUE objects.
   */
  public prependTlv(tlvType: number, omitEmpty?: typeof Encoder.OmitEmpty|Encodable,
                    ...tlvValue: Encodable[]) {
    let hasOmitEmpty = false;
    if (omitEmpty) {
      if (omitEmpty === Encoder.OmitEmpty) {
        hasOmitEmpty = true;
      } else {
        tlvValue.unshift(omitEmpty);
      }
    }

    const sizeBefore = this.size;
    this.prependValue(...tlvValue);

    const tlvLength = this.size - sizeBefore;
    if (tlvLength > 0 || !hasOmitEmpty) {
      this.prependTypeLength(tlvType, tlvLength);
    }
  }

  /** Prepend an Encodable object. */
  public encode(obj: Encodable|Encodable[]) {
    if (obj instanceof Uint8Array) {
      const dst = this.prependRoom(obj.byteLength);
      dst.set(obj);
    } else if (typeof obj === "object" && typeof (obj as EncodableObj).encodeTo === "function") {
      (obj as EncodableObj).encodeTo(this);
    } else if (Array.isArray(obj)) {
      if (typeof obj[0] === "number") {
        this.prependTlv(...(obj as EncodableTlv));
      } else {
        this.prependValue(...(obj as Encodable[]));
      }
    } else if (typeof obj !== "undefined") {
      throw new Error("Encoder.encode: obj is not Encodable");
    }
  }

  private grow(sizeofRoom: number) {
    const sizeofGrow = BUF_GROW_SIZE + sizeofRoom;
    const buf = new ArrayBuffer(sizeofGrow + this.size);
    new Uint8Array(buf, sizeofGrow).set(this.output);
    this.buf = buf;
    this.off = sizeofGrow;
  }
}

export namespace Encoder {
  export function asDataView(a: Uint8Array): DataView {
    return new DataView(a.buffer, a.byteOffset, a.byteLength);
  }

  export const OmitEmpty = Symbol("OmitEmpty");

  export function encode(obj: Encodable|Encodable[], initBufSize: number = BUF_INIT_SIZE) {
    const encoder = new Encoder(initBufSize);
    encoder.encode(obj);
    return encoder.output;
  }

  /** Extract the encoding output of an element while writing to a larger encoder. */
  export function extract(obj: Encodable|Encodable[], cb: (output: Uint8Array) => any): Encodable {
    return {
      encodeTo(encoder) {
        const sizeBefore = encoder.size;
        encoder.encode(obj);
        cb(encoder.slice(0, encoder.size - sizeBefore));
      },
    } as EncodableObj;
  }
}
