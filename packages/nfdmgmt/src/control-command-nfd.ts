import { StructFieldName, StructFieldNameNested, TT } from "@ndn/packet";
import { Decoder, EvDecoder, StructBuilder, StructFieldEnum, StructFieldNNI, type StructFields, StructFieldText } from "@ndn/tlv";

import { type ControlCommandOptions, invokeGeneric } from "./control-command-generic";
import { type ControlResponse } from "./control-response";
import { CsFlags, FaceFlags, FacePersistency, RouteFlags } from "./enum-nfd";

const flagBits = { ...FaceFlags, ...CsFlags, ...RouteFlags };

const buildControlParameters = new StructBuilder("ControlParameters", 0x68)
  .add(TT.Name, "name", StructFieldName)
  .add(0x69, "faceId", StructFieldNNI)
  .add(0x72, "uri", StructFieldText)
  .add(0x81, "localUri", StructFieldText)
  .add(0x6F, "origin", StructFieldNNI)
  .add(0x6A, "cost", StructFieldNNI)
  .add(0x83, "capacity", StructFieldNNI)
  .add(0x84, "count", StructFieldNNI)
  .add(0x87, "baseCongestionMarkingInterval", StructFieldNNI)
  .add(0x88, "defaultCongestionThreshold", StructFieldNNI)
  .add(0x89, "mtu", StructFieldNNI)
  .add(0x6C, "flags", StructFieldNNI, { flagPrefix: "flag", flagBits: flagBits })
  .add(0x70, "mask", StructFieldNNI, { flagBits: flagBits })
  .add(0x6B, "strategy", StructFieldNameNested)
  .add(0x6D, "expirationPeriod", StructFieldNNI)
  .add(0x85, "facePersistency", StructFieldEnum<FacePersistency>(FacePersistency))
  .setIsCritical(EvDecoder.neverCritical);
/** NFD Management ControlParameters struct. */
export class ControlParameters extends buildControlParameters.baseClass<ControlParameters>() {
  /**
   * Decode from ControlResponse body.
   * @param response ControlResponse that contains ControlParameters.
   */
  public static decodeFromResponseBody(response: { body: Uint8Array }): ControlParameters {
    return Decoder.decode(response.body, ControlParameters);
  }

  constructor(value: ControlParameters.Fields = {}) {
    super();
    Object.assign(this, value);
  }
}
buildControlParameters.subclass = ControlParameters;

export namespace ControlParameters {
  export type Fields = Partial<StructFields<typeof buildControlParameters>>;
}

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
  "defaultCongestionThreshold" | "mtu" | "flags" | `flag${keyof typeof FaceFlags}` | "mask">;
  "faces/update": CP<never, "faceId" | "facePersistency" | "baseCongestionMarkingInterval" |
  "defaultCongestionThreshold" | "flags" | `flag${keyof typeof FaceFlags}` | "mask">;
  "faces/destroy": CP<"faceId", never>;
  "strategy-choice/set": CP<"name" | "strategy", never>;
  "strategy-choice/unset": CP<"name", never>;
  "rib/register": CP<"name", "faceId" | "origin" | "cost" | "flags" |
  `flag${keyof typeof RouteFlags}` | "expirationPeriod">;
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
