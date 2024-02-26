import { type Decoder, type Encoder, EvDecoder } from "@ndn/tlv";
import { toUtf8 } from "@ndn/util";

import { TT } from "./an";
import type { SigInfo } from "./sig-info";

const timestampRe = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/;

function decodeTimestamp(str: string): number {
  const match = timestampRe.exec(str);
  if (!match) {
    throw new Error("invalid ISO8601 compact timestamp");
  }
  const [y, m, d, h, i, s] = match.slice(1).map((c) => Number.parseInt(c, 10)) as
    [number, number, number, number, number, number];
  return Date.UTC(y, m - 1, d, h, i, s);
}

function encodeTimestamp(timestamp: number): string {
  const dt = new Date(timestamp);
  const p = (f: "FullYear" | "Month" | "Date" | "Hours" | "Minutes" | "Seconds", size = 2, add = 0): string =>
    (add + dt[`getUTC${f}`]()).toString().padStart(size, "0");
  return `${p("FullYear", 4)}${p("Month", 2, 1)}${p("Date")}T${p("Hours")}${p("Minutes")}${p("Seconds")}`;
}

const EVD = new EvDecoder<ValidityPeriod>("ValidityPeriod", TT.ValidityPeriod)
  .add(TT.NotBefore, (t, { text }) => t.notBefore = decodeTimestamp(text), { required: true })
  .add(TT.NotAfter, (t, { text }) => t.notAfter = decodeTimestamp(text), { required: true });

/** Certificate validity period. */
export class ValidityPeriod {
  public static decodeFrom(decoder: Decoder): ValidityPeriod {
    return EVD.decode(new ValidityPeriod(), decoder);
  }

  constructor();
  constructor(notBefore: ValidityPeriod.TimestampInput, notAfter: ValidityPeriod.TimestampInput);
  constructor(
      notBefore: ValidityPeriod.TimestampInput = 0,
      notAfter: ValidityPeriod.TimestampInput = 0,
  ) {
    this.notBefore = Number(notBefore);
    this.notAfter = Number(notAfter);
  }

  public notBefore: number;
  public notAfter: number;

  public encodeTo(encoder: Encoder) {
    return encoder.prependTlv(TT.ValidityPeriod,
      [TT.NotBefore, toUtf8(encodeTimestamp(this.notBefore))],
      [TT.NotAfter, toUtf8(encodeTimestamp(this.notAfter))],
    );
  }

  /** Determine whether the specified timestamp is within validity period. */
  public includes(t: ValidityPeriod.TimestampInput): boolean {
    t = Number(t);
    return this.notBefore <= t && t <= this.notAfter;
  }

  /** Determine whether this validity period equals another. */
  public equals({ notBefore, notAfter }: ValidityPeriod): boolean {
    return this.notBefore === notBefore && this.notAfter === notAfter;
  }

  /** Compute the intersection of this and other validity periods. */
  public intersect(...validityPeriods: ValidityPeriod[]): ValidityPeriod {
    return new ValidityPeriod(
      Math.max(this.notBefore, ...validityPeriods.map(({ notBefore }) => notBefore)),
      Math.min(this.notAfter, ...validityPeriods.map(({ notAfter }) => notAfter)),
    );
  }

  public toString(): string {
    return `${encodeTimestamp(this.notBefore)}-${encodeTimestamp(this.notAfter)}`;
  }
}

export namespace ValidityPeriod {
  export type TimestampInput = number | Date;

  /** A very long ValidityPeriod. */
  export const MAX = new ValidityPeriod(
    540109800000,
    253402300799000,
  );

  /** Construct ValidityPeriod for n days from now. */
  export function daysFromNow(n: number): ValidityPeriod {
    const notBefore = Date.now();
    const notAfter = new Date(notBefore);
    notAfter.setUTCDate(notAfter.getUTCDate() + n);
    return new ValidityPeriod(notBefore, notAfter);
  }

  /**
   * Retrieve ValidityPeriod from SigInfo.
   * @deprecated Retrieve from `si.validity` directly.
   */
  export function get(si: SigInfo): ValidityPeriod | undefined {
    return si.validity;
  }

  /**
   * Assign ValidityPeriod onto SigInfo.
   * @deprecated Assign to `si.validity` directly.
   */
  export function set(si: SigInfo, v?: ValidityPeriod): void {
    si.validity = v;
  }
}
