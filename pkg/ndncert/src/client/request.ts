import { type ConsumerOptions, Endpoint } from "@ndn/endpoint";
import { Certificate, type NamedSigner, type NamedVerifier } from "@ndn/keychain";
import { type FwHint, Interest, type Name, type ValidityPeriod } from "@ndn/packet";

import * as crypto from "../crypto-common";
import { type CaProfile, ChallengeRequest, ChallengeResponse, ErrorMsg, NewRequest, NewResponse, Status } from "../packet/mod";
import type { ClientChallenge } from "./challenge";

/** {@link requestCertificate} options. */
export interface ClientOptions {
  /**
   * Endpoint for communication.
   * @defaultValue
   * Endpoint on default logical forwarder with up to 4 retransmissions.
   */
  endpoint?: Endpoint;

  /** CA profile. */
  profile: CaProfile;

  /** Private key corresponding to the public key. */
  privateKey: NamedSigner.PrivateKey;
  /** Public key to request certificate for. */
  publicKey: NamedVerifier.PublicKey;

  /**
   * ValidityPeriod of the certificate request.
   *
   * @remarks
   * This will be truncated to the maximum allowed by CA profile.
   */
  validity?: ValidityPeriod;

  /** Challenges in preferred order. */
  challenges: ClientChallenge[];
}

/** Request a certificate for the given key. */
export async function requestCertificate({
  endpoint = new Endpoint({ retx: 4 }),
  profile,
  privateKey,
  publicKey,
  validity,
  challenges,
}: ClientOptions): Promise<Certificate> {
  const consumerOptions: ConsumerOptions = {
    describe: `NDNCERT-CLIENT(${privateKey.name})`,
    verifier: profile.publicKey,
  };
  const signedInterestPolicy = crypto.makeSignedInterestPolicy();

  const [ecdhPvt, ecdhPub] = await crypto.generateEcdhKey();
  const newRequest = await NewRequest.build({
    profile,
    signedInterestPolicy,
    ecdhPub,
    publicKey,
    privateKey,
    validity,
  });
  const certRequestName = newRequest.certRequest.name;
  const newData = await endpoint.consume(newRequest.interest, consumerOptions);
  ErrorMsg.throwOnError(newData);
  const newResponse = await NewResponse.fromData(newData, profile);
  const { ecdhPub: caEcdhPub, salt, requestId, challenges: serverChallenges } = newResponse;

  const sessionKey = await crypto.makeSessionKey(ecdhPvt, caEcdhPub, salt, requestId);
  let challenge: ClientChallenge | undefined;
  for (const availChallenge of challenges) {
    if (serverChallenges.includes(availChallenge.challengeId)) {
      challenge = availChallenge;
      break;
    }
  }
  if (!challenge) {
    throw new Error(`no acceptable challenge in [${serverChallenges.join(",")}]`);
  }

  let challengeParameters = await challenge.start({ requestId, certRequestName });
  let issuedCertName: Name;
  let issuedCertFwHint: FwHint | undefined;
  while (true) {
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
    if (challengeResponse.status === Status.SUCCESS) {
      issuedCertName = challengeResponse.issuedCertName!;
      issuedCertFwHint = challengeResponse.fwHint;
      break;
    }
    challengeParameters = await challenge.next({
      requestId,
      certRequestName,
      challengeStatus: challengeResponse.challengeStatus!,
      remainingTries: challengeResponse.remainingTries!,
      remainingTime: challengeResponse.remainingTime!,
      parameters: challengeResponse.parameters ?? {},
    });
  }

  const issuedCertInterest = new Interest(issuedCertName);
  issuedCertInterest.fwHint = issuedCertFwHint;
  const issuedCertData = await endpoint.consume(issuedCertInterest, consumerOptions);
  const issuedCert = Certificate.fromData(issuedCertData);
  return issuedCert;
}
