import { SigInfo } from "@ndn/l3pkt";
import { Decoder, Encodable, Encoder, EvDecoder, Extension } from "@ndn/tlv";

import { TT } from "./an";

function decodeTimestamp(value: Uint8Array): Date {
  const str = new TextDecoder().decode(value);
  const match = str.match(/^([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})$/);
  if (!match) {
    throw new Error("invalid ISO8601 compact timestamp");
  }
  const [, y, m, d, h, i, s] = match.map((c) => parseInt(c, 10));
  return new Date(Date.UTC(y, m - 1, d, h, i, s));
}

function encodeTimestamp(d: Date): Uint8Array {
  const str = [
    d.getUTCFullYear().toString().padStart(4, "0"),
    (d.getUTCMonth() + 1).toString().padStart(2, "0"),
    d.getUTCDate().toString().padStart(2, "0"),
    "T",
    d.getUTCHours().toString().padStart(2, "0"),
    d.getUTCMinutes().toString().padStart(2, "0"),
    d.getUTCSeconds().toString().padStart(2, "0"),
  ].join("");
  return new TextEncoder().encode(str);
}

const EVD = new EvDecoder<ValidityPeriod>("ValidityPeriod", TT.ValidityPeriod)
.add(TT.NotBefore, (t, { value }) => t.notBefore = decodeTimestamp(value))
.add(TT.NotAfter, (t, { value }) => t.notAfter = decodeTimestamp(value));

/** Certificate validity period. */
export class ValidityPeriod {
  public static decodeFrom(decoder: Decoder): ValidityPeriod {
    return EVD.decode(new ValidityPeriod(), decoder);
  }

  public notBefore: Date;
  public notAfter: Date;

  constructor();

  constructor(notBefore: Date, notAfter: Date);

  constructor(arg1?: Date, arg2?: Date) {
    this.notBefore = arg1 ?? new Date(0);
    this.notAfter = arg2 ?? new Date(0);
  }

  public encodeTo(encoder: Encoder) {
    return encoder.prependTlv(TT.ValidityPeriod,
      [TT.NotBefore, encodeTimestamp(this.notBefore)],
      [TT.NotAfter, encodeTimestamp(this.notAfter)],
    );
  }

  /** Determine whether dt is within validity period. */
  public includes(dt: Date) {
    const t = dt.getTime();
    return this.notBefore.getTime() <= t && t <= this.notAfter.getTime();
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
  export function daysFromNow(n: number): ValidityPeriod {
    const notBefore = new Date();
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
