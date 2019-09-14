/**
 * An object that knows how to prepend itself to an Encoder.
 */
interface EncodableObj {
  encodeTo(encoder: Encoder);
}

/**
 * An encodable TLV structure.
 *
 * First item is a number for TLV-TYPE.
 * Subsequent items are Encodables for TLV-VALUE.
 */
type EncodableTlv = [number, ...any[]];

/**
 * An object acceptable to Encoder.encode().
 */
export type Encodable = ArrayBufferView | EncodableObj | EncodableTlv;

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

function writeVarNum(room: Buffer, off: number, n: number) {
  if (n < 0xFD) {
    room[off++] = n;
  } else if (n <= 0xFFFF) {
    room[off++] = 0xFD;
    room.writeUInt16BE(n, 1);
  } else {
    room[off++] = 0xFE;
    room.writeUInt32BE(n, 1);
  }
}

const BUF_INIT_SIZE = 10240;
const BUF_EXTENSION = Buffer.alloc(10240);

/**
 * TLV encoder that accepts objects in reverse order.
 */
export class Encoder {
  private buf_: ArrayBuffer;
  private off_: number;

  /**
   * Return encoding output size.
   */
  public get size(): number {
    return this.buf_.byteLength - this.off_;
  }

  /**
   * Obtain encoding output.
   */
  public get output(): Uint8Array {
    return new Uint8Array(this.buf_, this.off_);
  }

  constructor(initSize: number = BUF_INIT_SIZE) {
    this.buf_ = new ArrayBuffer(initSize);
    this.off_ = initSize;
  }

  /**
   * Make room to prepend an object.
   * @param sizeofObject object size.
   * @returns room to write object.
   */
  public prependRoom(sizeofObject: number): Buffer {
    if (this.off_ < sizeofObject) {
      this.extend(sizeofObject);
    }
    this.off_ -= sizeofObject;
    return Buffer.from(this.buf_, this.off_, sizeofObject);
  }

  /**
   * Prepend TLV-TYPE and TLV-LENGTH.
   */
  public prependTypeLength(tlvType: number, tlvLength: number) {
    const sizeofT = sizeofVarNum(tlvType);
    const sizeofL = sizeofVarNum(tlvLength);
    const room = this.prependRoom(sizeofT + sizeofL);
    writeVarNum(room, 0, tlvType);
    writeVarNum(room, sizeofT, tlvLength);
  }

  /**
   * Prepend TLV structure.
   * @param tlvType TLV-TYPE number.
   * @param tlvValue TLV-VALUE objects.
   */
  public prependTlv(tlvType: number, ...tlvValue: Encodable[]) {
    const sizeBefore = this.size;
    tlvValue.reverse().forEach(this.encode, this);
    const tlvLength = this.size - sizeBefore;
    this.prependTypeLength(tlvType, tlvLength);
  }

  /**
   * Prepend an Encodable object.
   */
  public encode(obj: Encodable) {
    if (ArrayBuffer.isView(obj)) {
      const dst = this.prependRoom(obj.byteLength);
      const src = Buffer.isBuffer(obj) ? obj : Buffer.from(obj.buffer, obj.byteOffset, obj.byteLength);
      src.copy(dst);
    } else if (typeof obj === "object" && typeof (obj as EncodableObj).encodeTo === "function") {
      (obj as EncodableObj).encodeTo(this);
    } else if (Array.isArray(obj) && typeof obj[0] === "number") {
      this.prependTlv.apply(this, obj);
    } else {
      throw new Error("Buffer.encode: obj is not Encodable");
    }
  }

  private extend(sizeofRoom: number) {
    const nExts = Math.ceil((sizeofRoom - this.off_) / BUF_EXTENSION.length);
    const sizeofExts = nExts * BUF_EXTENSION.length;
    const list = [Buffer.from(this.buf_)];
    for (let i = 0; i < nExts; ++i) {
      list.unshift(BUF_EXTENSION);
    }
    this.buf_ = Buffer.concat(list, sizeofExts + this.buf_.byteLength).buffer;
    this.off_ += sizeofExts;
  }
}
