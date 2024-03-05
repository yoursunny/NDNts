import { consume, type ConsumerOptions, type Endpoint } from "@ndn/endpoint";
import { Certificate, type NamedSigner, type NamedVerifier } from "@ndn/keychain";
import { Interest, type ValidityPeriod } from "@ndn/packet";

import * as crypto from "../crypto-common";
import { type CaProfile, ChallengeRequest, ChallengeResponse, ErrorMsg, NewRequest, NewResponse, Status } from "../packet/mod";
import type { ClientChallenge } from "./challenge";

/** {@link requestCertificate} options. */
export interface ClientOptions {
  /**
   * Endpoint for communication.
   * @deprecated Specify `.cOpts`.
   */
  endpoint?: Endpoint;

  /**
   * Consumer options.
   *
   * @remarks
   * - `.describe` defaults to "NDNCERT-client" + CA prefix + key name.
   * - `.retx` defaults to 4.
   * - `.verifier` is overridden.
   */
  cOpts?: ConsumerOptions;

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
  endpoint, // eslint-disable-line etc/no-deprecated
  cOpts,
  profile,
  privateKey,
  publicKey,
  validity,
  challenges,
}: ClientOptions): Promise<Certificate> {
  cOpts = {
    describe: `NDNCERT-client(${profile.prefix}, REQUEST, ${privateKey.name})`,
    retx: 4,
    ...endpoint?.cOpts,
    ...cOpts,
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
  const newData = await consume(newRequest.interest, cOpts);
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
  const issuedCertInterest = new Interest();
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

    const challengeData = await consume(challengeRequest.interest, cOpts);
    ErrorMsg.throwOnError(challengeData);

    const challengeResponse = await ChallengeResponse.fromData(challengeData, profile, requestId, sessionKey.sessionDecrypter);
    if (challengeResponse.status === Status.SUCCESS) {
      issuedCertInterest.name = challengeResponse.issuedCertName!;
      issuedCertInterest.fwHint = challengeResponse.fwHint;
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

  const issuedCertData = await consume(issuedCertInterest, cOpts);
  const issuedCert = Certificate.fromData(issuedCertData);
  return issuedCert;
}
