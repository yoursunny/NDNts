import { Endpoint, Producer } from "@ndn/endpoint";
import { Certificate, PrivateKey, PublicKey, ValidityPeriod } from "@ndn/keychain";
import { Component, ComponentLike, Data, Interest } from "@ndn/packet";
import { serveMetadata } from "@ndn/rdr";
import { toHex } from "@ndn/tlv";
import assert from "minimalistic-assert";

import * as crypto from "../crypto-common";
import { CaProfile, ChallengeRequest, ChallengeResponse, ErrorCode, ErrorMsg, NewRequest, NewResponse, Status, Verb } from "../packet/mod";

export interface ServerOptions {
  endpoint?: Endpoint;
  repo: RepoDataStore;
  profile: CaProfile;
  key: PrivateKey;
  issuerId?: ComponentLike;
}

interface RepoDataStore {
  insert(data: Data): Promise<void>;
}

export class Server {
  public static create({
    endpoint = new Endpoint(),
    repo,
    profile,
    key,
    issuerId = "NDNts-NDNCERT",
  }: ServerOptions): Server {
    return new Server(endpoint, repo, profile, key, Component.from(issuerId));
  }

  private constructor(
      endpoint: Endpoint,
      private readonly repo: RepoDataStore,
      private readonly profile: CaProfile,
      private readonly key: PrivateKey,
      private readonly issuerId: Component,
  ) {
    const { cert, prefix, data: { name: infoName } } = profile;
    assert(cert.certName.toKeyName().toName().equals(key.name));
    const infoVersion = infoName.getPrefix(-1);

    this.producers = [
      serveMetadata({ name: infoVersion }, { endpoint }),
      endpoint.produce(infoVersion, this.handleInfoInterest,
        { describe: `NDNCERT-CA(${prefix}, INFO)` }),
      endpoint.produce(prefix.append(Verb.PROBE), this.handleProbeInterest,
        { describe: `NDNCERT-CA(${prefix}, PROBE)` }),
      endpoint.produce(prefix.append(Verb.NEW), this.handleNewInterest,
        { describe: `NDNCERT-CA(${prefix}, NEW)` }),
      endpoint.produce(prefix.append(Verb.CHALLENGE), this.handleChallengeInterest,
        { describe: `NDNCERT-CA(${prefix}, CHALLENGE)` }),
    ];
  }

  private state = new Map<string, Context>();
  private producers: Producer[];

  public close() {
    this.producers.map((producer) => producer.close());
  }

  private handleInfoInterest = async (interest: Interest) => {
    return this.profile.data;
  };

  private handleProbeInterest = async (interest: Interest) => {
    return ErrorMsg.makeData(ErrorCode.NoAvailableName, interest, this.key);
  };

  private handleNewInterest = async (interest: Interest) => {
    const request = await NewRequest.fromInterest(interest, this.profile);

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
      updated: Date.now(),
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
      challenges: ["NOP"],
      signer: this.key,
    });
    return response.data;
  };

  private handleChallengeInterest = async (interest: Interest) => {
    const now = Date.now();
    const request = await ChallengeRequest.fromInterest(interest, this.profile, async (requestId) => {
      const context = this.state.get(toHex(requestId));
      if (!context || context.updated < now - 60000) {
        throw new Error("requestId absent");
      }
      return context;
    });
    const requestIdHex = toHex(request.requestId);
    const context = this.state.get(requestIdHex)!;
    this.state.delete(requestIdHex);

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
      remainingTries: 1,
      remainingTime: 30,
      issuedCertName,
      signer: this.key,
    });
    return response.data;
  };
}

interface Context {
  updated: number;
  sessionKey: CryptoKey;
  certRequestPub: PublicKey;
  validityPeriod: ValidityPeriod;
  status: Status;
}
