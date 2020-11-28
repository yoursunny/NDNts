import { Encodable, Encoder } from "./encoder";
import { toHex } from "./string";

class Nni1 {
  constructor(private readonly n: number) {
  }

  public encodeTo(encoder: Encoder) {
    encoder.prependRoom(1)[0] = this.n;
  }
}

class Nni2 {
  constructor(private readonly n: number) {
  }

  public encodeTo(encoder: Encoder) {
    Encoder.asDataView(encoder.prependRoom(2)).setUint16(0, this.n);
  }
}

class Nni4 {
  constructor(private readonly n: number) {
  }

  public encodeTo(encoder: Encoder) {
    Encoder.asDataView(encoder.prependRoom(4)).setUint32(0, this.n);
  }
}

class Nni8Number {
  constructor(private readonly n: number) {
  }

  public encodeTo(encoder: Encoder) {
    const dv = Encoder.asDataView(encoder.prependRoom(8));
    dv.setUint32(0, this.n / 0x100000000);
    dv.setUint32(4, this.n % 0x100000000);
  }
}

class Nni8Big {
  constructor(private readonly n: bigint) {
  }

  public encodeTo(encoder: Encoder) {
    encodeBig64(Encoder.asDataView(encoder.prependRoom(8)), this.n);
  }
}

function decode32(dv: DataView): number {
  switch (dv.byteLength) {
    case 1:
      return dv.getUint8(0);
    case 2:
      return dv.getUint16(0);
    case 4:
      return dv.getUint32(0);
  }
  throw new Error("incorrect TLV-LENGTH of NNI");
}

let BIG0: bigint;
let BIG32: bigint;
let BIG64: bigint;
let decodeBig: (dv: DataView) => bigint;
let encodeBig64: (dv: DataView, n: bigint) => void;

// Node.js and desktop browsers support all BigInt functions.
// iOS 14 supports BigInt constructor but lacks DataView methods.
// iOS 13 does not support BigInt.

/* istanbul ignore else */
if (typeof globalThis.BigInt === "function") {
  BIG0 = BigInt(0);
  BIG32 = BigInt("0x100000000");
  BIG64 = BigInt("0xFFFFFFFFFFFFFFFF");

  /* istanbul ignore else */
  if (typeof DataView.prototype.getBigUint64 === "function") {
    decodeBig = (dv) => {
      if (dv.byteLength === 8) {
        return dv.getBigUint64(0);
      }
      return BigInt(decode32(dv));
    };
  } else {
    decodeBig = (dv) => {
      if (dv.byteLength === 8) {
        return BigInt(dv.getUint32(0)) * BIG32 + BigInt(dv.getUint32(4));
      }
      return BigInt(decode32(dv));
    };
  }

  /* istanbul ignore else */
  if (typeof DataView.prototype.setBigUint64 === "function") {
    encodeBig64 = (dv, n) => dv.setBigUint64(0, n);
  } else {
    encodeBig64 = (dv, n) => {
      dv.setUint32(0, Number(n / BIG32));
      dv.setUint32(4, Number(n % BIG32));
    };
  }
} else {
  decodeBig = () => Number.NaN as any;
  encodeBig64 = (dv) => {
    dv.setUint32(0, 0);
    dv.setUint32(4, 0);
  };
}

type Len = 1|2|4|8;

interface Options<LenT = Len> {
  /** If set, use/enforce specific TLV-LENGTH. */
  len?: LenT;

  /** If true, allow approximate integers. */
  unsafe?: boolean;
}

const EncodeNniClass = {
  1: Nni1,
  2: Nni2,
  4: Nni4,
  8: Nni8Number,
};

/** Create Encodable from non-negative integer. */
export function NNI(n: number|bigint, {
  len,
  unsafe = false,
}: Options<Extract<Len, keyof typeof EncodeNniClass>> = {}): Encodable {
  if (len) {
    if (len === 8 && typeof n === "bigint") {
      return new Nni8Big(n);
    }
    return new EncodeNniClass[len](Number(n));
  }

  if (typeof n === "bigint") {
    switch (true) {
      case n < BIG0:
        throw new RangeError("NNI cannot be negative");
      case n < BIG32:
        n = Number(n);
        break;
      case n <= BIG64:
        return new Nni8Big(n);
      default:
        throw new RangeError("NNI is too large");
    }
  }

  switch (true) {
    case n < 0:
      throw new RangeError("NNI cannot be negative");
    case n < 0x100:
      return new Nni1(n);
    case n < 0x10000:
      return new Nni2(n);
    case n < 0x100000000:
      return new Nni4(n);
    case unsafe && n <= 0xFFFFFFFFFFFFFFFF: // eslint-disable-line @typescript-eslint/no-loss-of-precision
    case Number.isSafeInteger(n):
      return new Nni8Number(n);
    default:
      throw new RangeError("NNI is too large");
  }
}

export namespace NNI {
  /** Decode non-negative integer as number. */
  export function decode(value: Uint8Array, opts?: Options & { big?: false }): number;

  /** Decode non-negative integer as bigint. */
  export function decode(value: Uint8Array, opts: Options & { big: true }): bigint;

  export function decode(value: Uint8Array, {
    len,
    big = false,
    unsafe = false,
  }: Options & { big?: boolean } = {}) {
    if (len && value.byteLength !== len) {
      throw new Error(`incorrect TLV-LENGTH of NNI${len}`);
    }

    const dv = Encoder.asDataView(value);
    if (big) {
      return decodeBig(dv);
    }

    if (dv.byteLength === 8) {
      const n = dv.getUint32(0) * 0x100000000 + dv.getUint32(4);
      if (!unsafe && !Number.isSafeInteger(n)) {
        throw new RangeError(`NNI is too large ${toHex(value)}`);
      }
      return n;
    }
    return decode32(dv);
  }

  /** Error if n exceeds [0,MAX_SAFE_INTEGER] range. */
  export function constrain(n: number, typeName: string): number;
  /** Error if n exceeds [0,max] range. */
  export function constrain(n: number, typeName: string, max: number): number;
  /** Error if n exceeds [min,max] range. */
  export function constrain(n: number, typeName: string, min: number, max?: number): number;

  export function constrain(n: number, typeName: string, limit0?: number, limit1?: number): number {
    const [min = 0, max = Number.MAX_SAFE_INTEGER] =
      typeof limit1 === "number" ? [limit0, limit1] : [0, limit0];
    if (n < min || n > max) {
      throw new RangeError(`${n} is out of ${typeName} valid range`);
    }
    return Math.floor(n);
  }
}
