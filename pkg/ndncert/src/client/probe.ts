import { consume, type ConsumerOptions } from "@ndn/endpoint";
import { CertNaming } from "@ndn/keychain";
import type { Name } from "@ndn/packet";

import { type CaProfile, ErrorMsg, type ParameterKV, ProbeRequest, ProbeResponse } from "../packet/mod";

/** {@link requestProbe} options. */
export interface ClientProbeOptions {
  /**
   * Consumer options.
   *
   * @remarks
   * - `.describe` defaults to "NDNCERT-client" + CA prefix.
   * - `.retx` defaults to 4.
   * - `.verifier` is overridden.
   */
  cOpts?: ConsumerOptions;

  /** CA profile. */
  profile: CaProfile;

  /** PROBE parameters. */
  parameters: ParameterKV;
}

/** Run PROBE command to determine available names. */
export async function requestProbe({
  cOpts,
  profile,
  parameters,
}: ClientProbeOptions): Promise<ProbeResponse.Fields> {
  cOpts = {
    describe: `NDNCERT-client(${profile.prefix}, PROBE)`,
    retx: 4,
    ...cOpts,
    verifier: profile.publicKey,
  };

  const probeRequest = await ProbeRequest.build({
    profile,
    parameters,
  });
  const probeData = await consume(probeRequest.interest, cOpts);
  ErrorMsg.throwOnError(probeData);
  const probeResponse = await ProbeResponse.fromData(probeData, profile);
  return probeResponse;
}

/**
 * Determine if a subject name is acceptable according to probe response.
 * @param probeResponse - Probe response from CA.
 * @param name - Subject name, key name, or certificate name.
 * Only the subject name portion is considered.
 */
export function matchProbe(probeResponse: ProbeResponse.Fields, name: Name): boolean {
  name = CertNaming.toSubjectName(name);
  return probeResponse.entries.some(({ prefix, maxSuffixLength = Infinity }) => prefix.isPrefixOf(name) && name.length - prefix.length <= maxSuffixLength);
}
