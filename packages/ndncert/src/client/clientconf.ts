import { AltUri } from "@ndn/naming-convention2";
import { Data } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";
import Ajv, { type JSONSchemaType } from "ajv";
import { toBase64, toBuffer as b64ToBuffer } from "b64-lite";

import type { CaProfile } from "../packet/ca-profile";
import { retrieveCaProfile, type RetrieveCaProfileOptions } from "./retrieve-profile";

/**
 * client.conf format of NDNCERT C++ implementation.
 * https://github.com/named-data/ndncert/blob/48903c2f37a737c97dc51481d9a1a72e766990f7/client.conf.sample
 */
export interface ClientConf {
  "ca-list": ClientConf.CaProfile[];
}
export namespace ClientConf {
  export interface CaProfile {
    "ca-prefix": string;
    certificate: string;
  }
}

const schema: JSONSchemaType<ClientConf> = {
  type: "object",
  properties: {
    "ca-list": {
      type: "array",
      items: {
        type: "object",
        properties: {
          "ca-prefix": {
            type: "string",
          },
          certificate: {
            type: "string",
          },
        },
        required: ["ca-prefix", "certificate"],
      },
      minItems: 1,
    },
  },
  required: ["ca-list"],
};

const validate = new Ajv().compile(schema);

/** Export CA profile as client.conf of NDNCERT C++ implementation. */
export function exportClientConf(profile: CaProfile): ClientConf {
  return {
    "ca-list": [{
      "ca-prefix": AltUri.ofName(profile.prefix),
      certificate: toBase64(Encoder.encode(profile.cert.data)),
    }],
  };
}

/** Retrieve CA profile according to client.conf of NDNCERT C++ implementation. */
export async function importClientConf(
    conf: ClientConf,
    opts: Omit<RetrieveCaProfileOptions, "caPrefix" | "caCertFullName"> = {},
): Promise<CaProfile> {
  if (!validate(conf)) {
    throw new Error(`invalid client.conf\n${JSON.stringify(validate.errors)}`);
  }
  const confProfile = conf["ca-list"][0]!;

  const caCertData = new Decoder(b64ToBuffer(confProfile.certificate)).decode(Data);
  return retrieveCaProfile({
    ...opts,
    caPrefix: AltUri.parseName(confProfile["ca-prefix"]),
    caCertFullName: await caCertData.computeFullName(),
  });
}
