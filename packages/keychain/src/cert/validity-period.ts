import { SigInfo } from "@ndn/packet";
import { Decoder, Encodable, Encoder, EvDecoder, Extension, toUtf8 } from "@ndn/tlv";

import { TT } from "./an";

const timestampRe = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/;

function decodeTimestamp(str: string): Date {
  const match = timestampRe.exec(str);
  if (!match) {
    throw new Error("invalid ISO8601 compact timestamp");
  }
  const [y, m, d, h, i, s] = match.slice(1).map((c) => Number.parseInt(c, 10));
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
  return toUtf8(str);
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

  constructor(notBefore: Date, notAfter: Date);

  constructor(public notBefore = new Date(0), public notAfter = new Date(0)) {
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
  export const MAX = new ValidityPeriod(
    new Date(540109800000),
    new Date(253402300799000),
  );

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
