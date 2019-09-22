import { Encodable, Encoder } from "./encoder";

class NNI0 {
  public static decode(value: Uint8Array): number {
    const dv = Encoder.asDataView(value);
    switch (dv.byteLength) {
      case 1:
        return dv.getUint8(0);
      case 2:
        return dv.getUint16(0);
      case 4:
        return dv.getUint32(0);
      case 8:
        const n = dv.getUint32(0) * 0x100000000 + dv.getUint32(4);
        if (!Number.isSafeInteger(n)) {
          throw new Error("integer is too large");
        }
        return n;
    }
    throw new Error("invalid TLV-LENGTH");
  }

  constructor(private n: number) {
  }

  public encodeTo(encoder: Encoder) {
    if (this.n <= 0xFF) {
      encoder.prependRoom(1)[0] = this.n;
    } else if (this.n <= 0xFFFF) {
      Encoder.asDataView(encoder.prependRoom(2)).setUint16(0, this.n);
    } else if (this.n <= 0xFFFFFFFF) {
      Encoder.asDataView(encoder.prependRoom(4)).setUint32(0, this.n);
    } else if (Number.isSafeInteger(this.n)) {
      const dv = Encoder.asDataView(encoder.prependRoom(8));
      dv.setUint32(0, this.n / 0x100000000);
      dv.setUint32(4, this.n % 0x100000000);
    } else {
      throw new Error("integer is too large");
    }
  }
}

class NNI1 {
  public static decode(value: Uint8Array): number {
    if (value.byteLength !== 1) {
      throw new Error("invalid TLV-LENGTH");
    }
    return value[0];
  }

  constructor(private n: number) {
  }

  public encodeTo(encoder: Encoder) {
    encoder.prependRoom(1)[0] = this.n;
  }
}

class NNI4 {
  public static decode(value: Uint8Array): number {
    if (value.byteLength !== 4) {
      throw new Error("invalid TLV-LENGTH");
    }
    return Encoder.asDataView(value).getUint32(0);
  }

  constructor(private n: number) {
  }

  public encodeTo(encoder: Encoder) {
    Encoder.asDataView(encoder.prependRoom(4)).setUint32(0, this.n);
  }
}

type Len = 1|4;

const NniClass = {
  0: NNI0,
  1: NNI1,
  4: NNI4,
};

/** Create Encodable from non-negative integer. */
export function NNI(n: number, len?: Len): Encodable {
  return new NniClass[len || 0](n);
}

export namespace NNI {
  /** Decode non-negative integer. */
  export function decode(value: Uint8Array, len?: Len): number {
    return NniClass[len || 0].decode(value);
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
