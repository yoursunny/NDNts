import { SigInfo } from "@ndn/packet";
import { Decoder, Encodable, Encoder, EvDecoder, Extension, toUtf8 } from "@ndn/tlv";

import { TT } from "./an";

function toTimestamp(input: ValidityPeriod.TimestampInput): number {
  if (typeof input === "object") {
    return input.getTime();
  }
  return input;
}

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

function encodeTimestampString(timestamp: number): string {
  const d = new Date(timestamp);
  return [
    d.getUTCFullYear().toString().padStart(4, "0"),
    (d.getUTCMonth() + 1).toString().padStart(2, "0"),
    d.getUTCDate().toString().padStart(2, "0"),
    "T",
    d.getUTCHours().toString().padStart(2, "0"),
    d.getUTCMinutes().toString().padStart(2, "0"),
    d.getUTCSeconds().toString().padStart(2, "0"),
  ].join("");
}

function encodeTimestamp(timestamp: number): Uint8Array {
  return toUtf8(encodeTimestampString(timestamp));
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
    this.notBefore = toTimestamp(notBefore);
    this.notAfter = toTimestamp(notAfter);
  }

  public notBefore: number;
  public notAfter: number;

  public encodeTo(encoder: Encoder) {
    return encoder.prependTlv(TT.ValidityPeriod,
      [TT.NotBefore, encodeTimestamp(this.notBefore)],
      [TT.NotAfter, encodeTimestamp(this.notAfter)],
    );
  }

  /** Determine whether the specified timestamp is within validity period. */
  public includes(t: ValidityPeriod.TimestampInput): boolean {
    t = toTimestamp(t);
    return this.notBefore <= t && t <= this.notAfter;
  }

  /** Determine whether this validity period equals another. */
  public equals({ notBefore, notAfter }: ValidityPeriod): boolean {
    return this.notBefore === notBefore &&
           this.notAfter === notAfter;
  }

  /** Compute the intersection of this and other validity periods. */
  public intersect(...validityPeriods: ValidityPeriod[]): ValidityPeriod {
    return new ValidityPeriod(
      Math.max(this.notBefore, ...validityPeriods.map(({ notBefore }) => notBefore)),
      Math.min(this.notAfter, ...validityPeriods.map(({ notAfter }) => notAfter)),
    );
  }

  public toString(): string {
    return `${encodeTimestampString(this.notBefore)}-${encodeTimestampString(this.notAfter)}`;
  }
}

SigInfo.registerExtension({
  tt: TT.ValidityPeriod,
  decode(obj: SigInfo, { decoder }: Decoder.Tlv): ValidityPeriod {
    return decoder.decode(ValidityPeriod);
  },
  encode(obj: SigInfo, value: ValidityPeriod): Encodable {
    return value;
  },
});

export namespace ValidityPeriod {
  export type TimestampInput = number|Date;

  export const MAX = new ValidityPeriod(
    540109800000,
    253402300799000,
  );

  export function daysFromNow(n: number): ValidityPeriod {
    const notBefore = Date.now();
    const notAfter = new Date(notBefore);
    notAfter.setUTCDate(notAfter.getUTCDate() + n);
    return new ValidityPeriod(notBefore, notAfter);
  }

  export function get(si: SigInfo): ValidityPeriod|undefined {
    return Extension.get(si, TT.ValidityPeriod) as ValidityPeriod|undefined;
  }

  export function set(si: SigInfo, v?: ValidityPeriod) {
    Extension.set(si, TT.ValidityPeriod, v);
  }
}
