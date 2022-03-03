import { ConsumerOptions, Endpoint } from "@ndn/endpoint";

import { type ParameterKV, ErrorMsg, ProbeRequest, ProbeResponse } from "../packet/mod";
import type { ClientOptionsCommon } from "./client";

export interface ClientProbeOptions extends ClientOptionsCommon {
  parameters: ParameterKV;
}

/** Request a certificate for the given key. */
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
