import { TT } from "@ndn/l3pkt";
import { Name } from "@ndn/name";
import { EncodableObj, EncodableTlv, Encoder, NNI } from "@ndn/tlv";

interface Fields {
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

const fieldDefs = [
  [TT.Name, "name", null],
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
] as Array<[number, keyof Fields, any]>;

/** NFD Management ControlParameters struct (encoding only). */
export class ControlParameters {
  constructor(value: Fields = {}) {
    Object.assign(this, value);
  }

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(
      0x68,
      ...fieldDefs.map(([tt, key, type]) => {
        const value = this[key];
        switch (true) {
          case typeof value === "undefined":
            return undefined;
          case type === NNI:
            return [tt, NNI(value as number)] as EncodableTlv;
          case type === String:
            return [tt, new TextEncoder().encode(value as string)] as EncodableTlv;
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

type Fields_ = Fields;

export namespace ControlParameters {
  export type Fields = Fields_;
}
