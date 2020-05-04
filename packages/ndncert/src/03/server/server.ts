import { Endpoint, Producer } from "@ndn/endpoint";
import { Certificate, PrivateKey, PublicKey, ValidityPeriod } from "@ndn/keychain";
import { Component, ComponentLike, Data, Interest } from "@ndn/packet";
import { serveMetadata } from "@ndn/rdr";
import { toHex } from "@ndn/tlv";
import assert from "minimalistic-assert";

import * as crypto from "../crypto-common";
import { CaProfile, ChallengeRequest, ChallengeResponse, ErrorCode, ErrorMsg, NewRequest, NewResponse, Status, Verb } from "../packet/mod";
import { ServerChallenge } from "./challenge";

export interface ServerOptions {
  endpoint?: Endpoint;
  repo: RepoDataStore;
  profile: CaProfile;
  key: PrivateKey;
  challenges: ServerChallenge[];
  issuerId?: ComponentLike;
}

interface RepoDataStore {
  insert: (data: Data) => Promise<void>;
}

export class Server {
  public static create({
    endpoint = new Endpoint(),
    repo,
    profile,
    key,
    challenges,
    issuerId = "NDNts-NDNCERT",
  }: ServerOptions): Server {
    return new Server(endpoint, repo, profile, key,
      new Map<string, ServerChallenge>(challenges.map((challenge) => [challenge.challengeId, challenge])),
      Component.from(issuerId));
  }

  private constructor(
      endpoint: Endpoint,
      private readonly repo: RepoDataStore,
      private readonly profile: CaProfile,
      private readonly key: PrivateKey,
      private readonly challenges: Map<string, ServerChallenge>,
      private readonly issuerId: Component,
  ) {
    const { cert, prefix, data: { name: infoName } } = profile;
    assert(cert.certName.key.equals(key.name));
    const infoVersion = infoName.getPrefix(-1);

    this.producers = [
      serveMetadata({ name: infoVersion }, { endpoint, announcement: prefix }),
      endpoint.produce(infoVersion, this.handleInfoInterest,
        { describe: `NDNCERT-CA(${prefix}, INFO)`, announcement: prefix }),
      endpoint.produce(prefix.append(Verb.PROBE), this.handleProbeInterest,
        { describe: `NDNCERT-CA(${prefix}, PROBE)`, announcement: prefix }),
      endpoint.produce(prefix.append(Verb.NEW), this.handleNewInterest,
        { describe: `NDNCERT-CA(${prefix}, NEW)`, announcement: prefix }),
      endpoint.produce(prefix.append(Verb.CHALLENGE), this.handleChallengeInterest,
        { describe: `NDNCERT-CA(${prefix}, CHALLENGE)`, announcement: prefix }),
    ];

    this.cleanupTimer = setInterval(this.cleanupContext, 60000);
  }

  private state = new Map<string, Context>();
  private cleanupTimer: NodeJS.Timeout;
  private producers: Producer[];

  public close() {
    clearInterval(this.cleanupTimer);
    this.producers.map((producer) => producer.close());
  }

  private handleInfoInterest = async (interest: Interest) => {
    return this.profile.data;
  };

  private handleProbeInterest = async (interest: Interest) => {
    return ErrorMsg.makeData(ErrorCode.NoAvailableName, interest, this.key);
  };

  private handleNewInterest = async (interest: Interest) => {
    let request: NewRequest;
    try {
      request = await NewRequest.fromInterest(interest, this.profile);
    } catch {
      return await ErrorMsg.makeData(ErrorCode.BadParameterFormat, interest, this.key);
    }

    let requestId: Uint8Array;
    let requestIdHex: string;
    do {
      requestId = crypto.makeRequestId();
      requestIdHex = toHex(requestId);
    } while (this.state.has(requestIdHex));

    const salt = crypto.makeSalt();
    const { privateKey: ecdhPvt, publicKey: ecdhPub } = await crypto.generateEcdhKey();
    const sessionKey = await crypto.makeSessionKey(ecdhPvt, request.ecdhPub, salt, requestId);

    this.state.set(requestIdHex, {
      expiry: Date.now() + BEFORE_CHALLENGE_EXPIRY,
      sessionKey,
      certRequestPub: request.publicKey,
      validityPeriod: request.certRequest.validity,
      status: Status.BEFORE_CHALLENGE,
    });

    const response = await NewResponse.build({
      profile: this.profile,
      request,
      ecdhPub,
      salt,
      requestId,
      challenges: Array.from(this.challenges.keys()),
      signer: this.key,
    });
    return response.data;
  };

  private handleChallengeInterest = async (interest: Interest) => {
    let request: ChallengeRequest;
    try {
      request = await ChallengeRequest.fromInterest(interest, this.profile, async (requestId) => {
        return this.state.get(toHex(requestId));
      });
    } catch {
      return await ErrorMsg.makeData(ErrorCode.BadParameterFormat, interest, this.key);
    }

    const context = this.state.get(toHex(request.requestId))!;
    const now = Date.now();

    if (context.expiry < now) {
      this.deleteContext(request);
      return ErrorMsg.makeData(ErrorCode.OutOfTime, interest, this.key);
    }
    if (context.status === Status.BEFORE_CHALLENGE) {
      return this.startChallenge(now, request, context);
    }
    if (request.selectedChallenge !== context.challengeId) {
      this.deleteContext(request);
      return ErrorMsg.makeData(ErrorCode.InvalidParameters, interest, this.key);
    }
    if (context.challengeRemainingTries! <= 0) {
      this.deleteContext(request);
      return ErrorMsg.makeData(ErrorCode.OutOfTries, interest, this.key);
    }
    return this.continueChallenge(now, request, context);
  };

  private startChallenge(now: number, request: ChallengeRequest, context: Context) {
    const challenge = this.challenges.get(request.selectedChallenge);
    if (!challenge) {
      this.deleteContext(request);
      return ErrorMsg.makeData(ErrorCode.InvalidParameters, request.interest, this.key);
    }

    context.status = Status.CHALLENGE;
    context.challengeId = challenge.challengeId;
    context.challengeRemainingTries = challenge.retryLimit;
    context.expiry = now + challenge.timeLimit;
    return this.continueChallenge(now, request, context);
  }

  private async continueChallenge(now: number, request: ChallengeRequest, context: Context) {
    const challenge = this.challenges.get(context.challengeId!)!;
    const {
      success,
      decrementRetry,
      challengeStatus,
    } = await challenge.process(request, context);
    if (success) {
      return this.finishChallenge(now, request, context);
    }
    if (decrementRetry) {
      context.challengeRemainingTries! -= 1;
    }

    const response = await ChallengeResponse.build({
      profile: this.profile,
      sessionKey: context.sessionKey,
      request,
      status: Status.CHALLENGE,
      challengeStatus,
      remainingTries: context.challengeRemainingTries!,
      remainingTime: context.expiry - now,
      signer: this.key,
    });
    return response.data;
  }

  private async finishChallenge(now: number, request: ChallengeRequest, context: Context) {
    this.deleteContext(request);

    const issuedCert = await Certificate.issue({
      issuerId: this.issuerId,
      issuerPrivateKey: this.key,
      publicKey: context.certRequestPub,
      validity: context.validityPeriod,
    });
    const issuedCertName = await issuedCert.data.computeFullName();
    await this.repo.insert(issuedCert.data);

    const response = await ChallengeResponse.build({
      profile: this.profile,
      sessionKey: context.sessionKey,
      request,
      status: Status.SUCCESS,
      challengeStatus: "OK",
      remainingTries: 0,
      remainingTime: 0,
      issuedCertName,
      signer: this.key,
    });
    return response.data;
  }

  private deleteContext({ requestId }: ChallengeRequest) {
    this.state.delete(toHex(requestId));
  }

  private cleanupContext = () => {
    const now = Date.now();
    for (const [requestIdHex, { expiry }] of this.state) {
      if (expiry < now) {
        this.state.delete(requestIdHex);
      }
    }
  };
}

const BEFORE_CHALLENGE_EXPIRY = 60000;

interface Context {
  expiry: number;
  sessionKey: CryptoKey;
  certRequestPub: PublicKey;
  validityPeriod: ValidityPeriod;
  status: Status;
  challengeId?: string;
  challengeState?: unknown;
  challengeRemainingTries?: number;
}
