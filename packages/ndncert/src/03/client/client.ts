import { Endpoint } from "@ndn/endpoint";
import { Certificate, PrivateKey, PublicKey, ValidityPeriod } from "@ndn/keychain";
import { Interest, Name } from "@ndn/packet";

import * as crypto from "../crypto-common";
import { CaProfile, ChallengeRequest, ChallengeResponse, ErrorMsg, NewRequest, NewResponse, Status } from "../packet/mod";
import { ClientChallenge } from "./challenge";

export interface ClientOptions {
  endpoint?: Endpoint;
  profile: CaProfile;
  privateKey: PrivateKey;
  publicKey: PublicKey;
  validity?: ValidityPeriod;
  challenges: ClientChallenge[];
}

export async function requestCertificate({
  endpoint = new Endpoint(),
  profile,
  privateKey,
  publicKey,
  validity,
  challenges,
}: ClientOptions): Promise<Certificate> {
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
  ErrorMsg.throwOnError(newData);
  const newResponse = await NewResponse.fromData(newData, profile);
  const { ecdhPub: caEcdhPub, salt, requestId, challenges: serverChallenges } = newResponse;

  const sessionKey = await crypto.makeSessionKey(ecdhPvt, caEcdhPub, salt, requestId);
  let challenge: ClientChallenge|undefined;
  for (const availChallenge of challenges) {
    if (serverChallenges.includes(availChallenge.challengeId)) {
      challenge = availChallenge;
      break;
    }
  }
  if (!challenge) {
    throw new Error(`no acceptable challenge in [${serverChallenges.join()}]`);
  }

  let challengeParameters = await challenge.start({ requestId });
  let issuedCertName: Name;
  for (;;) {
    const challengeRequest = await ChallengeRequest.build({
      profile,
      requestId,
      sessionKey,
      publicKey,
      privateKey,
      selectedChallenge: challenge.challengeId,
      parameters: challengeParameters,
    });
    const challengeData = await endpoint.consume(challengeRequest.interest, { describe });
    ErrorMsg.throwOnError(challengeData);
    const challengeResponse = await ChallengeResponse.fromData(challengeData, profile, sessionKey);
    const { status, challengeStatus, remainingTries, remainingTime } = challengeResponse;
    if (status === Status.SUCCESS) {
      issuedCertName = challengeResponse.issuedCertName!;
      break;
    }
    challengeParameters = await challenge.next({
      requestId,
      challengeStatus,
      remainingTries,
      remainingTime,
    });
  }

  const issuedCertData = await endpoint.consume(new Interest(issuedCertName), { describe });
  const issuedCert = Certificate.fromData(issuedCertData);
  return issuedCert;
}
