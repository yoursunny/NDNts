import { asDataView, assert } from "@ndn/util";

/** An object that knows how to prepend itself to an Encoder. */
export interface EncodableObj {
  encodeTo: (encoder: Encoder) => void;
}

/**
 * An encodable TLV structure.
 *
 * @remarks
 * First item is a number for TLV-TYPE.
 * Optional second item could be {@link Encoder.OmitEmpty} to omit the TLV if TLV-VALUE is empty.
 * Subsequent items are `Encodable`s for TLV-VALUE.
 */
export type EncodableTlv = [type: number, ...Encodable[]] |
  [type: number, omitEmpty: typeof Encoder.OmitEmpty, ...Encodable[]];

/**
 * An object acceptable to {@link Encoder.encode}.
 *
 * @remarks
 * - `Uint8Array`: prepended as is.
 * - `undefined` and `false`: skipped.
 * - `EncodableObj`: `.encodeTo(encoder)` is invoked.
 * - `EncodableTlv`: passed to {@link Encoder.prependTlv}.
 * - `Encodable[]`: passed to {@link Encoder.prependValue}.
 */
export type Encodable = Uint8Array | undefined | false | EncodableObj | EncodableTlv | readonly Encodable[];

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
  // 64-bit integers may lose precision in Number type, and it's rarely useful
  throw new Error("VAR-NUMBER is too large");
}

function writeVarNum(room: Uint8Array, dv: DataView, off: number, n: number) {
  if (n < 0xFD) {
    room[off++] = n;
  } else if (n <= 0xFFFF) {
    room[off++] = 0xFD;
    dv.setUint16(off, n);
  } else {
    room[off++] = 0xFE;
    dv.setUint32(off, n);
  }
}

/** TLV encoder that accepts objects in reverse order. */
export class Encoder {
  constructor(initSize = 2048) {
    this.buf = new ArrayBuffer(initSize);
    this.off = initSize;
  }

  private buf: ArrayBuffer;
  private off: number;

  /** Return encoding output size. */
  public get size(): number {
    return this.buf.byteLength - this.off;
  }

  /** Obtain encoding output. */
  public get output(): Uint8Array {
    return new Uint8Array(this.buf, this.off);
  }

  /**
   * Make room to prepend an object.
   * @param sizeofObject - Object size.
   * @returns Room to write object.
   */
  public prependRoom(sizeofObject: number): Uint8Array {
    if (this.off < sizeofObject) {
      this.grow(sizeofObject);
    }
    this.off -= sizeofObject;
    return new Uint8Array(this.buf, this.off, sizeofObject);
  }

  /** Prepend TLV-TYPE and TLV-LENGTH. */
  public prependTypeLength(tlvType: number, tlvLength: number) {
    const sizeofT = sizeofVarNum(tlvType);
    const sizeofL = sizeofVarNum(tlvLength);
    const room = this.prependRoom(sizeofT + sizeofL);
    const dv = asDataView(room);
    writeVarNum(room, dv, 0, tlvType);
    writeVarNum(room, dv, sizeofT, tlvLength);
  }

  /**
   * Prepend TLV-VALUE.
   *
   * @remarks
   * Elements are prepended in the reverse order, so that they would appear in the output
   * in the same order as the parameter order.
   */
  public prependValue(...tlvValue: Encodable[]) {
    for (let i = tlvValue.length - 1; i >= 0; --i) {
      this.encode(tlvValue[i]);
    }
  }

  /**
   * Prepend TLV structure.
   * @see {@link EncodableTlv}
   */
  public prependTlv(tlvType: number, ...tlvValue: Encodable[]): void;

  /**
   * Prepend TLV structure, but skip if TLV-VALUE is empty.
   * @see {@link EncodableTlv}
   */
  public prependTlv(tlvType: number, omitEmpty: typeof Encoder.OmitEmpty, ...tlvValue: Encodable[]): void;

  public prependTlv(tlvType: number, arg2?: typeof Encoder.OmitEmpty | Encodable, ...tlvValue: Encodable[]) {
    const hasOmitEmpty = arg2 === Encoder.OmitEmpty;
    if (!hasOmitEmpty) {
      tlvValue.unshift(arg2);
    }

    const sizeBefore = this.size;
    this.prependValue(...tlvValue);

    const tlvLength = this.size - sizeBefore;
    if (tlvLength > 0 || !hasOmitEmpty) {
      this.prependTypeLength(tlvType, tlvLength);
    }
  }

  /** Prepend `Encodable`. */
  public encode(obj: Encodable): void {
    if (obj instanceof Uint8Array) {
      this.prependRoom(obj.length).set(obj);
    } else if (typeof (obj as EncodableObj | undefined)?.encodeTo === "function") {
      (obj as EncodableObj).encodeTo(this);
    } else if (Array.isArray(obj)) {
      if (typeof obj[0] === "number") {
        this.prependTlv(...(obj as [number, ...any[]]));
      } else {
        this.prependValue(...(obj as readonly Encodable[]));
      }
    } else {
      assert(obj === undefined || obj === false, "obj is not Encodable");
    }
  }

  private grow(sizeofRoom: number) {
    const sizeofGrowth = 2048 + sizeofRoom;
    const buf = new ArrayBuffer(sizeofGrowth + this.size);
    new Uint8Array(buf, sizeofGrowth).set(this.output);
    this.buf = buf;
    this.off = sizeofGrowth;
  }
}

export namespace Encoder {
  /**
   * Indicate that TLV should be skipped if TLV-VALUE is empty.
   * @see {@link EncodableTlv}
   */
  export const OmitEmpty = Symbol("@ndn/tlv#OmitEmpty");

  /** Encode a single object into Uint8Array. */
  export function encode(obj: Encodable, initBufSize?: number): Uint8Array {
    const encoder = new Encoder(initBufSize);
    encoder.encode(obj);
    return encoder.output;
  }

  /**
   * Extract the encoding output of an element while writing to a parent encoder.
   * @param obj - Encodable element.
   * @param cb - Function to receive the encoding output of `obj`.
   * @returns Wrapped Encodable object.
   */
  export function extract(obj: Encodable, cb: (output: Uint8Array) => void): Encodable {
    return {
      encodeTo(encoder) {
        const sizeBefore = encoder.size;
        encoder.encode(obj);
        cb(encoder.output.subarray(0, encoder.size - sizeBefore));
      },
    };
  }
}
