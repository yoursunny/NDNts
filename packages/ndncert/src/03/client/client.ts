import { ConsumerOptions, Endpoint, RetxPolicy } from "@ndn/endpoint";
import { Certificate, NamedSigner, NamedVerifier, ValidityPeriod } from "@ndn/keychain";
import { Name } from "@ndn/packet";

import * as crypto from "../crypto-common";
import { CaProfile, ChallengeRequest, ChallengeResponse, ErrorMsg, NewRequest, NewResponse, Status } from "../packet/mod";
import type { ClientChallenge } from "./challenge";

export interface ClientOptions {
  /** Endpoint for communication. */
  endpoint?: Endpoint;

  /** Interest retransmission policy, default is 4 retransmissions. */
  retx?: RetxPolicy;

  profile: CaProfile;
  privateKey: NamedSigner.PrivateKey;
  publicKey: NamedVerifier.PublicKey;

  /** ValidityPeriod, will be truncated to the maximum allowed by CA profile. */
  validity?: ValidityPeriod;

  /** Challenges in preferred order. */
  challenges: ClientChallenge[];
}

/** Request a certificate for the given key. */
export async function requestCertificate({
  endpoint = new Endpoint(),
  retx = 4,
  profile,
  privateKey,
  publicKey,
  validity,
  challenges,
}: ClientOptions): Promise<Certificate> {
  const consumerOptions: ConsumerOptions = {
    describe: `NDNCERT-CLIENT(${privateKey.name})`,
    retx,
  };
  const signedInterestPolicy = crypto.makeSignedInterestPolicy();

  const { privateKey: ecdhPvt, publicKey: ecdhPub } = await crypto.generateEcdhKey();
  const newRequest = await NewRequest.build({
    profile,
    signedInterestPolicy,
    ecdhPub,
    publicKey,
    privateKey,
    validity,
  });
  const newData = await endpoint.consume(newRequest.interest, consumerOptions);
  ErrorMsg.throwOnError(newData);
  const newResponse = await NewResponse.fromData(newData, profile);
  const { ecdhPub: caEcdhPub, salt, requestId, challenges: serverChallenges } = newResponse;

  const sessionKey = await crypto.makeSessionKey(
    ecdhPvt, caEcdhPub, salt, requestId, crypto.SessionRole.REQUESTER);
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
      signedInterestPolicy,
      requestId,
      ...sessionKey,
      publicKey,
      privateKey,
      selectedChallenge: challenge.challengeId,
      parameters: challengeParameters,
    });
    const challengeData = await endpoint.consume(challengeRequest.interest, consumerOptions);
    ErrorMsg.throwOnError(challengeData);
    const challengeResponse = await ChallengeResponse.fromData(challengeData, profile, requestId, sessionKey.sessionDecrypter);
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

  const issuedCertData = await endpoint.consume(issuedCertName, consumerOptions);
  const issuedCert = Certificate.fromData(issuedCertData);
  return issuedCert;
}
