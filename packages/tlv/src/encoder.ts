/**
 * An object that knows how to prepend itself to an Encoder.
 */
export interface Encodable {
  encodeTo(encoder: Encoder);
}

const BUF_EXTENSION = Buffer.alloc(10240);

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

/**
 * TLV encoder that accepts objects in reverse order.
 */
export class Encoder {
  private buf_: ArrayBuffer;
  private off_: number;
  private valueEnds_: number[];

  /**
   * Obtain encoding output.
   */
  public get output(): Uint8Array {
    return new Uint8Array(this.buf_, this.off_);
  }

  constructor(initSize: number = 10240) {
    this.buf_ = new ArrayBuffer(initSize);
    this.off_ = initSize;
    this.valueEnds_ = [];
  }

  /**
   * Make room to prepend an object.
   * @param sizeofObject object size.
   * @returns room to write object.
   */
  public prepend(sizeofObject: number): Buffer {
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
    const room = this.prepend(sizeofT + sizeofL);
    writeVarNum(room, 0, tlvType);
    writeVarNum(room, sizeofT, tlvLength);
  }

  /**
   * Begin writing TLV-VALUE.
   */
  public beginValue() {
    this.valueEnds_.push(this.off_);
  }

  /**
   * Prepend TLV-TYPE and TLV-LENGTH upon finishing TLV-VALUE.
   */
  public endValue(tlvType: number) {
    const endOffset = this.valueEnds_.pop();
    if (typeof endOffset === "undefined") {
      throw new Error("no TLV-VALUE is being written");
    }
    const tlvLength = endOffset - this.off_;
    this.prependTypeLength(tlvType, tlvLength);
  }

  /**
   * Prepend an Encodable object.
   */
  public encode(obj: Encodable) {
    obj.encodeTo(this);
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
    this.valueEnds_ = this.valueEnds_.map((off) => sizeofExts + off);
  }
}
