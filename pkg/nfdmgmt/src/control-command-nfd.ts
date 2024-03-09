import { type Name, StructFieldName, StructFieldNameNested, TT as l3TT } from "@ndn/packet";
import { Decoder, EvDecoder, StructBuilder, StructFieldEnum, StructFieldNNI, type StructFields, StructFieldText } from "@ndn/tlv";
import type { SetRequired } from "type-fest";

import { CsFlags, FaceFlags, FacePersistency, RouteFlags, TT } from "./an-nfd";
import { type ControlCommandOptions, invokeGeneric } from "./control-command-generic";
import type { ControlResponse } from "./control-response";

const flagBits = { ...FaceFlags, ...CsFlags, ...RouteFlags };

const buildControlParameters = new StructBuilder("ControlParameters", TT.ControlParameters)
  .add(l3TT.Name, "name", StructFieldName)
  .add(TT.FaceId, "faceId", StructFieldNNI)
  .add(TT.Uri, "uri", StructFieldText)
  .add(TT.LocalUri, "localUri", StructFieldText)
  .add(TT.Origin, "origin", StructFieldNNI)
  .add(TT.Cost, "cost", StructFieldNNI)
  .add(TT.Capacity, "capacity", StructFieldNNI)
  .add(TT.Count, "count", StructFieldNNI)
  .add(TT.Flags, "flags", StructFieldNNI, { flagPrefix: "flag", flagBits })
  .add(TT.Mask, "mask", StructFieldNNI, { flagBits })
  .add(TT.Strategy, "strategy", StructFieldNameNested)
  .add(TT.ExpirationPeriod, "expirationPeriod", StructFieldNNI)
  .add(TT.FacePersistency, "facePersistency", StructFieldEnum<FacePersistency>(FacePersistency))
  .add(TT.BaseCongestionMarkingInterval, "baseCongestionMarkingInterval", StructFieldNNI)
  .add(TT.DefaultCongestionThreshold, "defaultCongestionThreshold", StructFieldNNI)
  .add(TT.Mtu, "mtu", StructFieldNNI)
  .setIsCritical(EvDecoder.neverCritical);
/** NFD Management ControlParameters struct. */
export class ControlParameters extends buildControlParameters.baseClass<ControlParameters>() {
  /**
   * Decode from {@link ControlResponse} body.
   * @param response - {@link ControlResponse} that contains ControlParameters.
   */
  public static decodeFromResponseBody(response: { body: Uint8Array }): ControlParameters {
    return Decoder.decode(response.body, ControlParameters);
  }

  constructor(value: ControlParameters.Fields = {}) {
    super();
    for (const key of buildControlParameters.keys) {
      (this as any)[key] = (value as any)[key];
    }
  }
}
buildControlParameters.subclass = ControlParameters;

export namespace ControlParameters {
  export type Fields = Partial<StructFields<typeof buildControlParameters>>;
}

/**
 * Pick fields from ControlParameters.Fields.
 * @typeParam R - Required fields.
 * @typeParam O - Optional fields.
 */
type CP<R extends keyof ControlParameters.Fields, O extends keyof ControlParameters.Fields> =
  SetRequired<Pick<ControlParameters.Fields, R | O>, R>;

/** Declare required and optional fields of each command. */
interface Commands {
  "faces/create": CP<"uri",
  "localUri" | "facePersistency" | "baseCongestionMarkingInterval" | "defaultCongestionThreshold" |
  "mtu" | "flags" | `flag${keyof typeof FaceFlags}` | "mask" | `mask${keyof typeof FaceFlags}`
  >;

  "faces/update": CP<never,
  "faceId" | "facePersistency" | "baseCongestionMarkingInterval" | "defaultCongestionThreshold" |
  "mtu" | "flags" | `flag${keyof typeof FaceFlags}` | "mask" | `mask${keyof typeof FaceFlags}`
  >;

  "faces/destroy": CP<"faceId", never>;

  "cs/config": CP<never,
  "capacity" | "flags" | `flag${keyof typeof CsFlags}` | "mask" | `mask${keyof typeof CsFlags}`
  >;

  "cs/erase": CP<"name", "count">;

  "strategy-choice/set": CP<"name" | "strategy", never>;

  "strategy-choice/unset": CP<"name", never>;

  "rib/register": CP<"name",
  "faceId" | "origin" | "cost" | "flags" | `flag${keyof typeof RouteFlags}` | "expirationPeriod">;

  "rib/unregister": CP<"name", "faceId" | "origin">;
}

/**
 * Invoke NFD ControlCommand and wait for response.
 * @param command - Command module and verb.
 * @param params - Command parameters.
 * @param opts - Other options.
 * @returns Command response.
 */
export async function invoke<C extends keyof Commands>(command: C, params: Commands[C], opts: ControlCommandOptions = {}): Promise<ControlResponse> {
  return invokeGeneric(command, new ControlParameters(params), opts);
}

/**
 * Erase all CS entries under a name prefix.
 * @param name - Name prefix.
 * @param opts - Other options.
 * @returns Total erased entries.
 *
 * @remarks
 * NFD cs/erase command can impose a limit on how many CS entries may be erased upon each
 * invocation. This function repeatedly invoke cs/erase until it returns zero. Notice that this
 * function could take a long time if `name` is a busy prefix, and this function may continue
 * forever if `name` is a prefix of `opts.prefix`.
 */
export async function invokeCsErase(name: Name, opts: ControlCommandOptions = {}): Promise<number> {
  let total = 0;
  while (true) {
    const cr = await invoke("cs/erase", { name }, opts);
    if (cr.statusCode !== 200) {
      throw new Error(`cs/erase ${cr.statusCode} ${cr.statusText}`);
    }
    const cp = ControlParameters.decodeFromResponseBody(cr);
    if (!cp.count) { // 0 (fully erased) or undefined (NFD violated protocol)
      break;
    }
    total += cp.count;
  }
  return total;
}
