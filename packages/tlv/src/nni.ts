import { asDataView, toHex } from "@ndn/util";

import type { Encodable, EncodableObj, Encoder } from "./encoder";

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
    dv.setUint32(4, this.n);
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
    case 1: {
      return dv.getUint8(0);
    }
    case 2: {
      return dv.getUint16(0);
    }
    case 4: {
      return dv.getUint32(0);
    }
  }
  throw new Error("incorrect TLV-LENGTH of NNI");
}

type Len = 1 | 2 | 4 | 8;

const EncodeNniClass = {
  1: Nni1,
  2: Nni2,
  4: Nni4,
  8: Nni8Number,
} satisfies Record<Len, new(n: number) => EncodableObj>;

/**
 * Create Encodable from non-negative integer.
 *
 * @throws RangeError
 * Thrown if the number may lose precision and `unsafe` option is not set.
 */
export function NNI(n: number | bigint, {
  len,
  unsafe = false,
}: NNI.Options = {}): Encodable {
  if (len) {
    if (len === 8 && typeof n === "bigint") {
      return new Nni8Big(n);
    }
    return new EncodeNniClass[len](Number(n));
  }

  if (typeof n === "bigint") {
    switch (true) {
      case n < 0x100000000n: {
        n = Number(n);
        break;
      }
      case n <= 0xFFFFFFFFFFFFFFFFn: {
        return new Nni8Big(n);
      }
      default: {
        throw new RangeError("NNI is too large");
      }
    }
  }

  switch (true) {
    case n < 0: {
      throw new RangeError("NNI cannot be negative");
    }
    case n < 0x100: {
      return new Nni1(n);
    }
    case n < 0x10000: {
      return new Nni2(n);
    }
    case n < 0x100000000: {
      return new Nni4(n);
    }
    case n <= (unsafe ? 0xFFFFFFFFFFFFFFFF : Number.MAX_SAFE_INTEGER): { // eslint-disable-line @typescript-eslint/no-loss-of-precision
      return new Nni8Number(n);
    }
    default: {
      throw new RangeError("NNI is too large");
    }
  }
}

export namespace NNI {
  export interface Options {
    /**
     * Encode to specific length.
     * Enforce specific length during decoding.
     */
    len?: Len;

    /**
     * Decode to bigint instead of number.
     * @defaultValue `false`
     */
    big?: boolean;

    /**
     * Permit large numbers that exceed MAX_SAFE_INTEGER, which may lose precision.
     * @defaultValue `false`
     */
    unsafe?: boolean;
  }

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
  }: Options = {}) {
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
}
