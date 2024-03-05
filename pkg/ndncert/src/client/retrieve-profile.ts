import { consume, type ConsumerOptions, type Endpoint } from "@ndn/endpoint";
import { CertNaming } from "@ndn/keychain";
import { Segment } from "@ndn/naming-convention2";
import type { Name } from "@ndn/packet";
import { retrieveMetadata } from "@ndn/rdr";

import { C, CaProfile, ProbeResponse } from "../packet/mod";

/** {@link retrieveCaProfile} options. */
export interface RetrieveCaProfileOptions {
  /**
   * Endpoint for communication.
   * @deprecated Specify `.cOpts`.
   */
  endpoint?: Endpoint;

  /**
   * Consumer options.
   *
   * @remarks
   * - `.describe` defaults to "NDNCERT-client" + CA prefix.
   * - `.retx` defaults to 4.
   */
  cOpts?: ConsumerOptions;

  /**
   * CA prefix.
   * @defaultValue
   * Using the subject name of CA certificate name.
   */
  caPrefix?: Name;

  /** CA certificate name with implicit digest. */
  caCertFullName: Name;
}

/** Retrieve and validate CA profile. */
export async function retrieveCaProfile({
  endpoint, // eslint-disable-line etc/no-deprecated
  cOpts,
  caPrefix,
  caCertFullName,
}: RetrieveCaProfileOptions): Promise<CaProfile> {
  cOpts = {
    describe: `NDNCERT-client(${caPrefix}, INFO)`,
    retx: 4,
    ...endpoint?.cOpts,
    ...cOpts,
  };
  ProbeResponse.checkCaCertFullName(caCertFullName);
  caPrefix ??= CertNaming.toSubjectName(caCertFullName.getPrefix(-1));

  const metadata = await retrieveMetadata(caPrefix.append(C.CA, C.INFO), cOpts);
  const profileData = await consume(metadata.name.append(Segment, 0), cOpts);
  const profile = await CaProfile.fromData(profileData);

  const profileCertFullName = await profile.cert.data.computeFullName();
  if (!profileCertFullName.equals(caCertFullName)) {
    throw new Error(`CA profile contains certificate ${profileCertFullName}, expecting ${caCertFullName}`);
  }
  return profile;
}
