import { Endpoint } from "@ndn/endpoint";
import { CertNaming } from "@ndn/keychain";
import { Segment } from "@ndn/naming-convention2";
import { Interest, type Name } from "@ndn/packet";
import { retrieveMetadata } from "@ndn/rdr";

import { C, CaProfile, ProbeResponse } from "../packet/mod";

export interface RetrieveCaProfileOptions {
  /**
   * Endpoint for communication.
   * Default is an Endpoint on default Forwarder with up to 4 retransmissions.
   */
  endpoint?: Endpoint;

  /**
   * CA prefix.
   * Default is using the subject name of CA certificate name.
   */
  caPrefix?: Name;

  /** CA certificate name with implicit digest. */
  caCertFullName: Name;
}

/** Retrieve and verify CA profile. */
export async function retrieveCaProfile({
  endpoint = new Endpoint({ retx: 4 }),
  caPrefix,
  caCertFullName,
}: RetrieveCaProfileOptions): Promise<CaProfile> {
  ProbeResponse.checkCaCertFullName(caCertFullName);
  caPrefix ??= CertNaming.toSubjectName(caCertFullName.getPrefix(-1));

  const metadata = await retrieveMetadata(caPrefix.append(C.CA, C.INFO), { endpoint });
  const profileData = await endpoint.consume(new Interest(metadata.name.append(Segment, 0)));
  const profile = await CaProfile.fromData(profileData);

  const profileCertFullName = await profile.cert.data.computeFullName();
  if (!profileCertFullName.equals(caCertFullName)) {
    throw new Error(`CA profile contains certificate ${profileCertFullName}, expecting ${caCertFullName}`);
  }
  return profile;
}
