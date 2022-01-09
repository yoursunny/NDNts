import { Name, TT } from "@ndn/packet";
import { type EncodableObj, type EncodableTlv, Encoder, NNI, toUtf8 } from "@ndn/tlv";

const fieldDefs: Array<[number, keyof ControlParameters.Fields, any]> = [
  [TT.Name, "name", undefined],
  [0x69, "faceId", NNI],
  [0x72, "uri", String],
  [0x81, "localUri", String],
  [0x6F, "origin", NNI],
  [0x6A, "cost", NNI],
  [0x83, "capacity", NNI],
  [0x84, "count", NNI],
  [0x87, "baseCongestionMarkingInterval", NNI],
  [0x88, "defaultCongestionPeriod", NNI],
  [0x89, "mtu", NNI],
  [0x6C, "flags", NNI],
  [0x70, "mask", NNI],
  [0x6B, "strategy", Name],
  [0x6D, "expirationPeriod", NNI],
  [0x85, "facePersistency", NNI],
];

/** NFD Management ControlParameters struct (encoding only). */
export class ControlParameters {
  constructor(value: ControlParameters.Fields = {}) {
    Object.assign(this, value);
  }

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(
      0x68,
      ...fieldDefs.map(([tt, key, type]) => {
        const value = this[key];
        switch (true) {
          case value === undefined:
            return undefined;
          case type === NNI:
            return [tt, NNI(value as number)] as EncodableTlv;
          case type === String:
            return [tt, toUtf8(value as string)] as EncodableTlv;
          case type === Name:
            return [tt, value as Name] as EncodableTlv;
          default:
            return value as EncodableObj;
        }
      }),
    );
  }
}
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
