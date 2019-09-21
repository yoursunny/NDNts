import { Encodable, Encoder } from "./encoder";

class VarEncodable {
  constructor(private n: number) {
  }

  public encodeTo(encoder: Encoder) {
    if (this.n <= 0xFF) {
      const b = encoder.prependRoom(1);
      b[0] = this.n;
    } else if (this.n <= 0xFFFF) {
      const b = encoder.prependRoom(2);
      b.writeUInt16BE(this.n, 0);
    } else if (this.n <= 0xFFFFFFFF) {
      const b = encoder.prependRoom(4);
      b.writeUInt32BE(this.n, 0);
    } else if (Number.isSafeInteger(this.n)) {
      const b = encoder.prependRoom(8);
      b.writeUInt32BE(this.n / 0x100000000, 0);
      b.writeUInt32BE(this.n % 0x100000000, 4);
    } else {
      throw new Error("integer is too large");
    }
  }
}

function varDecode(buf: Buffer): number {
  switch (buf.length) {
    case 1:
      return buf[0];
    case 2:
      return buf.readUInt16BE(0);
    case 4:
      return buf.readUInt32BE(0);
    case 8:
      const n = buf.readUInt32BE(0) * 0x100000000 + buf.readUInt32BE(4);
      if (!Number.isSafeInteger(n)) {
        throw new Error("integer is too large");
      }
      return n;
  }
  throw new Error("invalid TLV-LENGTH");
}

class FixedEncodable {
  constructor(private n: number, private len: number) {
  }

  public encodeTo(encoder: Encoder) {
    const room = encoder.prependRoom(this.len);
    room.writeUIntBE(this.n, 0, this.len);
  }
}

function fixedDecode(buf: Buffer, len: number): number {
  if (buf.length !== len) {
    throw new Error("invalid TLV-LENGTH");
  }
  return buf.readUIntBE(0, len);
}

/**
 * Create Encodable from non-negative integer.
 */
export function NNI(n: number, len?: number): Encodable {
  return len ? new FixedEncodable(n, len) : new VarEncodable(n);
}

export namespace NNI {
  /** Decode non-negative integer. */
  export function decode(b: Uint8Array, len?: number): number {
    const buf = Buffer.from(b.buffer, b.byteOffset, b.byteLength);
    return len ? fixedDecode(buf, len) : varDecode(buf);
  }

  /** Error if n exceeds [min,max] range. */
  export function constrain(n: number, typeName: string,
                            max: number = Number.MAX_SAFE_INTEGER, min: number = 0): number {
    if (n >= min && n <= max) {
      return Math.floor(n);
    }
    throw new RangeError(`${n} is out of ${typeName} valid range`);
  }
}
