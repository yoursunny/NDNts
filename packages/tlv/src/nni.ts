import { Encoder } from "./encoder";

class NNIClass extends Number {
  constructor(n: number) {
    super(n);
  }

  public encodeTo(encoder: Encoder) {
    const n = Number(this);
    if (n <= 0xFF) {
      const b = encoder.prependRoom(1);
      b[0] = n;
    } else if (n <= 0xFFFF) {
      const b = encoder.prependRoom(2);
      b.writeUInt16BE(n, 0);
    } else if (n <= 0xFFFFFFFF) {
      const b = encoder.prependRoom(4);
      b.writeUInt32BE(n, 0);
    } else if (Number.isSafeInteger(n)) {
      const b = encoder.prependRoom(8);
      b.writeUInt32BE(n / 0x100000000, 0);
      b.writeUInt32BE(n % 0x100000000, 4);
    } else {
      throw new Error("integer is too large");
    }
  }
}

/**
 * Create Encodable from non-negative integer.
 */
export function NNI(n: number): NNIClass {
  return new NNIClass(n);
}

export interface NNI {
  /** Encode non-negative integer. */
  encode(n: number): Uint8Array;
  /** Decode non-negative integer. */
  decode(b: Uint8Array): number;
}

NNI.encode = (n: number): Uint8Array => {
  const encoder = new Encoder(8);
  NNI(n).encodeTo(encoder);
  return encoder.output;
};

NNI.decode = (b: Uint8Array): number => {
  const buf = Buffer.from(b.buffer, b.byteOffset, b.byteLength);
  switch (b.length) {
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
};
