import { Endpoint } from "@ndn/endpoint";
import { PrivateKey, PublicKey, ValidityPeriod } from "@ndn/keychain";
import { Name } from "@ndn/packet";

import * as crypto from "../crypto-common";
import { CaProfile, ChallengeRequest, ChallengeResponse, NewRequest, NewResponse } from "../packet/mod";

export interface ClientOptions {
  endpoint?: Endpoint;
  profile: CaProfile;
  privateKey: PrivateKey;
  publicKey: PublicKey;
  validity?: ValidityPeriod;
}

export async function requestCertificate({
  endpoint = new Endpoint(),
  profile,
  privateKey,
  publicKey,
  validity,
}: ClientOptions): Promise<Name> {
  const describe = `NDNCERT-CLIENT(${privateKey.name})`;

  const { privateKey: ecdhPvt, publicKey: ecdhPub } = await crypto.generateEcdhKey();
  const newRequest = await NewRequest.build({
    profile,
    ecdhPub,
    publicKey,
    privateKey,
    validity,
  });
  const newData = await endpoint.consume(newRequest.interest, { describe });
  const newResponse = await NewResponse.fromData(newData, profile);
  const { ecdhPub: caEcdhPub, salt, requestId } = newResponse;

  const sessionKey = await crypto.makeSessionKey(ecdhPvt, caEcdhPub, salt, requestId);
  const challengeRequest = await ChallengeRequest.build({
    profile,
    requestId,
    sessionKey,
    publicKey,
    privateKey,
    selectedChallenge: "NOP",
    parameters: new Map<string, string>(),
  });
  const challengeData = await endpoint.consume(challengeRequest.interest, { describe });
  const { issuedCertName } = await ChallengeResponse.fromData(challengeData, profile, sessionKey);
  if (!issuedCertName) {
    throw new Error("certificate not issued");
  }
  return issuedCertName;
}
