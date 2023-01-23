import { Name, TT } from "@ndn/packet";
import { type Decoder, type Encodable, type Encoder, EvDecoder, NNI } from "@ndn/tlv";
import { toUtf8 } from "@ndn/util";

const TtControlParameters = 0x68;

type FieldDef<K extends keyof ControlParameters.Fields> = [
  tt: number,
  key: K,
  encodeValue: (v: NonNullable<ControlParameters.Fields[K]>) => Encodable,
  decode: (tlv: Decoder.Tlv) => ControlParameters.Fields[K],
];

function decodeNNI({ nni }: Decoder.Tlv) {
  return nni;
}

function decodeString({ text }: Decoder.Tlv) {
  return text;
}

const fieldDefs: Array<FieldDef<any>> = [
  [TT.Name, "name", (name) => name.value, ({ decoder }) => decoder.decode(Name)],
  [0x69, "faceId", NNI, decodeNNI],
  [0x72, "uri", toUtf8, decodeString],
  [0x81, "localUri", toUtf8, decodeString],
  [0x6F, "origin", NNI, decodeNNI],
  [0x6A, "cost", NNI, decodeNNI],
  [0x83, "capacity", NNI, decodeNNI],
  [0x84, "count", NNI, decodeNNI],
  [0x87, "baseCongestionMarkingInterval", NNI, decodeNNI],
  [0x88, "defaultCongestionPeriod", NNI, decodeNNI],
  [0x89, "mtu", NNI, decodeNNI],
  [0x6C, "flags", NNI, decodeNNI],
  [0x70, "mask", NNI, decodeNNI],
  [0x6B, "strategy", (name) => name, ({ vd }) => vd.decode(Name)],
  [0x6D, "expirationPeriod", NNI, decodeNNI],
  [0x85, "facePersistency", NNI, decodeNNI],
];

const EVD = new EvDecoder<ControlParameters>("ControlParameters", TtControlParameters)
  .setIsCritical(() => false);
for (const [tt, key,, decode] of fieldDefs) {
  EVD.add(tt, (t, tlv) => {
    (t as any)[key] = decode(tlv);
  });
}

/** NFD Management ControlParameters struct. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ControlParameters {
  public static decodeFrom(decoder: Decoder): ControlParameters {
    return EVD.decode(new ControlParameters(), decoder);
  }

  constructor(value: ControlParameters.Fields = {}) {
    Object.assign(this, value);
  }

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(
      TtControlParameters,
      ...fieldDefs.map(([tt, key, encodeValue]): Encodable => {
        const v = (this as any)[key];
        return v !== undefined && [tt, encodeValue(v)];
      }),
    );
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ControlParameters extends ControlParameters.Fields {}

export namespace ControlParameters {
  export interface Fields {
    name?: Name;
    faceId?: number;
    uri?: string;
    localUri?: string;
    origin?: number;
    cost?: number;
    capacity?: number;
    count?: number;
    baseCongestionMarkingInterval?: number;
    defaultCongestionPeriod?: number;
    mtu?: number;
    flags?: number;
    mask?: number;
    strategy?: Name;
    expirationPeriod?: number;
    facePersistency?: number;
  }
}
