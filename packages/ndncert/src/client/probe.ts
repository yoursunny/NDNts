import { ConsumerOptions, Endpoint } from "@ndn/endpoint";
import { CertNaming } from "@ndn/keychain";
import type { Name } from "@ndn/packet";

import { type ParameterKV, ErrorMsg, ProbeRequest, ProbeResponse } from "../packet/mod";
import type { ClientOptionsCommon } from "./client";

export interface ClientProbeOptions extends ClientOptionsCommon {
  parameters: ParameterKV;
}

/** Run PROBE command to determine available names. */
export async function requestProbe({
  endpoint = new Endpoint(),
  retx = 4,
  profile,
  parameters,
}: ClientProbeOptions): Promise<ProbeResponse.Fields> {
  const consumerOptions: ConsumerOptions = {
    describe: "NDNCERT-CLIENT-PROBE",
    retx,
    verifier: profile.publicKey,
  };

  const probeRequest = await ProbeRequest.build({
    profile,
    parameters,
  });
  const probeData = await endpoint.consume(probeRequest.interest, consumerOptions);
  ErrorMsg.throwOnError(probeData);
  const probeResponse = await ProbeResponse.fromData(probeData, profile);
  return probeResponse;
}

/**
 * Determine if a subject name is acceptable according to probe response.
 * @param probeResponse probe response from CA.
 * @param name subject name, key name, or certificate name. Only the subject name portion is considered.
 */
export function probeMatch(probeResponse: ProbeResponse.Fields, name: Name): boolean {
  name = CertNaming.toSubjectName(name);
  return probeResponse.entries.some(
    ({ prefix, maxSuffixLength = Infinity }) => prefix.isPrefixOf(name) && name.length - prefix.length <= maxSuffixLength);
}
