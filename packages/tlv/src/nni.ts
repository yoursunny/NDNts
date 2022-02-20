import { asDataView, toHex } from "@ndn/util";

import { type Encodable, Encoder } from "./encoder";

class Nni1 {
  constructor(private readonly n: number) {}

  public encodeTo(encoder: Encoder) {
    encoder.prependRoom(1)[0] = this.n;
  }
}

class Nni2 {
  constructor(private readonly n: number) {}

  public encodeTo(encoder: Encoder) {
    asDataView(encoder.prependRoom(2)).setUint16(0, this.n);
  }
}

class Nni4 {
  constructor(private readonly n: number) {}

  public encodeTo(encoder: Encoder) {
    asDataView(encoder.prependRoom(4)).setUint32(0, this.n);
  }
}

class Nni8Number {
  constructor(private readonly n: number) {}

  public encodeTo(encoder: Encoder) {
    const dv = asDataView(encoder.prependRoom(8));
    dv.setUint32(0, this.n / 0x100000000);
    dv.setUint32(4, this.n % 0x100000000);
  }
}

class Nni8Big {
  constructor(private readonly n: bigint) {}

  public encodeTo(encoder: Encoder) {
    asDataView(encoder.prependRoom(8)).setBigUint64(0, this.n);
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

type Len = 1 | 2 | 4 | 8;

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
export function NNI(n: number | bigint, {
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
      case n < 0n:
        throw new RangeError("NNI cannot be negative");
      case n < 0x100000000n:
        n = Number(n);
        break;
      case n <= 0xFFFFFFFFFFFFFFFFn:
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
  /** Determine if len is a valid length of encoded NNI. */
  export function isValidLength(len: number): boolean {
    return !!(EncodeNniClass as Record<number, unknown>)[len];
  }

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

    const dv = asDataView(value);
    if (big) {
      return dv.byteLength === 8 ? dv.getBigUint64(0) : BigInt(decode32(dv));
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
    if (!(n >= min && n <= max)) {
      throw new RangeError(`${n} is out of ${typeName} valid range`);
    }
    return Math.trunc(n);
  }
}
