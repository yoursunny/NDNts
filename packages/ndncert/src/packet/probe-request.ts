import { Interest } from "@ndn/packet";
import { Decoder, Encoder, EvDecoder } from "@ndn/tlv";

import { C } from "./an";
import type { CaProfile } from "./ca-profile";
import * as parameter_kv from "./parameter-kv";

const EVD = new EvDecoder<ProbeRequest.Fields>("ProbeRequest", undefined);
parameter_kv.parseEvDecoder(EVD, 1);

/** PROBE request packet. */
export class ProbeRequest {
  public static async fromInterest(
      interest: Interest,
      { profile }: ProbeRequest.Context,
  ): Promise<ProbeRequest> {
    await interest.validateParamsDigest();
    if (!(interest.name.getPrefix(-3).equals(profile.prefix) &&
          interest.name.at(-3).equals(C.CA) &&
          interest.name.at(-2).equals(C.PROBE))) {
      throw new Error("bad Name");
    }

    const request = new ProbeRequest(interest);
    request.checkKeys(profile.probeKeys);
    return request;
  }

  private constructor(public readonly interest: Interest) {
    if (!interest.appParameters) {
      throw new Error("ApplicationParameter is missing");
    }
    EVD.decodeValue(this, new Decoder(interest.appParameters));
  }

  private checkKeys(probeKeys: readonly string[]) {
    const keys = new Set(probeKeys);
    for (const key of Object.keys(this.parameters)) {
      if (!keys.delete(key)) {
        throw new Error(`unknown probe key ${key}`);
      }
    }

    if (keys.size > 0) {
      throw new Error(`missing probe ${keys.size > 1 ? "keys" : "key"} ${Array.from(keys).join(", ")}`);
    }
  }
}
export interface ProbeRequest extends Readonly<ProbeRequest.Fields> {}

export namespace ProbeRequest {
  export interface Context {
    profile: CaProfile;
  }

  export interface Fields {
    parameters: parameter_kv.ParameterKV;
  }

  export interface Options extends Context, Fields {
  }

  export async function build({
    profile,
    parameters,
  }: Options) {
    const payload = Encoder.encode([
      ...parameter_kv.encode(parameters),
    ]);

    const interest = new Interest();
    interest.name = profile.prefix.append(C.CA, C.PROBE);
    interest.mustBeFresh = true;
    interest.appParameters = payload;
    await interest.updateParamsDigest();
    return ProbeRequest.fromInterest(interest, { profile });
  }
}
