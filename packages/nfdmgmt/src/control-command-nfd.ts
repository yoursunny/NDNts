import { Name, TT } from "@ndn/packet";
import { Decoder, type Encodable, type Encoder, EvDecoder, NNI } from "@ndn/tlv";
import { toUtf8 } from "@ndn/util";

import { type ControlCommandOptions, invokeGeneric } from "./control-command-generic";
import { type ControlResponse } from "./control-response";

/**
 * Pick fields from ControlParameters.Fields.
 * R are required.
 * O are optional.
 */
type CP<R extends keyof ControlParameters.Fields, O extends keyof ControlParameters.Fields> =
  Required<Pick<ControlParameters.Fields, R>> & Pick<ControlParameters.Fields, O>;

/** Declare required and optional fields of each command. */
interface Commands {
  "faces/create": CP<"uri", "localUri" | "facePersistency" | "baseCongestionMarkingInterval" |
  "defaultCongestionThreshold" | "mtu" | "flags" | "mask">;
  "faces/update": CP<never, "faceId" | "facePersistency" | "baseCongestionMarkingInterval" |
  "defaultCongestionThreshold" | "flags" | "mask">;
  "faces/destroy": CP<"faceId", never>;
  "strategy-choice/set": CP<"name" | "strategy", never>;
  "strategy-choice/unset": CP<"name", never>;
  "rib/register": CP<"name", "faceId" | "origin" | "cost" | "flags" | "expirationPeriod">;
  "rib/unregister": CP<"name", "faceId" | "origin">;
}

/**
 * Invoke NFD ControlCommand and wait for response.
 * @param command command module and verb.
 * @param params command parameters.
 * @param opts other options.
 * @returns command response.
 */
export async function invoke<C extends keyof Commands>(command: C, params: Commands[C], opts: ControlCommandOptions = {}): Promise<ControlResponse> {
  return invokeGeneric(command, new ControlParameters(params), opts);
}

/** NFD Management ControlParameters struct. */
export class ControlParameters {
  public static decodeFrom(decoder: Decoder): ControlParameters {
    return EVD.decode(new ControlParameters(), decoder);
  }

  /**
   * Decode from ControlResponse body.
   * @param response ControlResponse that contains ControlParameters.
   */
  public static decodeFromResponseBody(response: { body: Uint8Array }): ControlParameters {
    return Decoder.decode(response.body, ControlParameters);
  }

  constructor(value: ControlParameters.Fields = {}) {
    Object.assign(this, value);
  }

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(
      TtControlParameters,
      ...fieldDefs.map(([tt, key, encodeValue]): Encodable => {
        const v = this[key];
        return v !== undefined && [tt, encodeValue(v)];
      }),
    );
  }

  public toString(): string {
    return fieldDefs.flatMap(([, key]) => {
      const v = this[key];
      return v === undefined ? [] : `${key}=${v}`;
    }).join(", ");
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
    defaultCongestionThreshold?: number;
    mtu?: number;
    flags?: number;
    mask?: number;
    strategy?: Name;
    expirationPeriod?: number;
    facePersistency?: number;
  }

  export enum FacePersistency {
    OnDemand = 0,
    Persistent = 1,
    Permanent = 2,
  }

  export const FaceFlags = {
    LocalFieldsEnabled: 1 << 0,
    LpReliabilityEnabled: 1 << 1,
    CongestionMarkingEnabled: 1 << 2,
  };

  export const RouteFlags = {
    ChildInherit: 1 << 0,
    Capture: 1 << 1,
  };
}

const TtControlParameters = 0x68;

const fieldDefs: Array<[
  tt: number,
  key: keyof ControlParameters.Fields,
  encodeValue: (v: any) => Encodable,
]> = [];

const EVD = new EvDecoder<ControlParameters.Fields>("ControlParameters", TtControlParameters)
  .setIsCritical(() => false);

function defField<K extends keyof ControlParameters.Fields>(tt: number, key: K,
    encodeValue: (v: NonNullable<ControlParameters.Fields[K]>) => Encodable,
    decode: (tlv: Decoder.Tlv) => ControlParameters.Fields[K],
): void {
  fieldDefs.push([tt, key, encodeValue]);
  EVD.add(tt, (t, tlv) => {
    t[key] = decode(tlv);
  });
}

function decodeNNI({ nni }: Decoder.Tlv) {
  return nni;
}

function decodeString({ text }: Decoder.Tlv) {
  return text;
}

defField(TT.Name, "name", (name) => name.value, ({ decoder }) => decoder.decode(Name));
defField(0x69, "faceId", NNI, decodeNNI);
defField(0x72, "uri", toUtf8, decodeString);
defField(0x81, "localUri", toUtf8, decodeString);
defField(0x6F, "origin", NNI, decodeNNI);
defField(0x6A, "cost", NNI, decodeNNI);
defField(0x83, "capacity", NNI, decodeNNI);
defField(0x84, "count", NNI, decodeNNI);
defField(0x87, "baseCongestionMarkingInterval", NNI, decodeNNI);
defField(0x88, "defaultCongestionThreshold", NNI, decodeNNI);
defField(0x89, "mtu", NNI, decodeNNI);
defField(0x6C, "flags", NNI, decodeNNI);
defField(0x70, "mask", NNI, decodeNNI);
defField(0x6B, "strategy", (name) => name, ({ vd }) => vd.decode(Name));
defField(0x6D, "expirationPeriod", NNI, decodeNNI);
defField(0x85, "facePersistency", NNI, decodeNNI);
