import { Forwarder, SimpleEndpoint } from "@ndn/fw";
import { Certificate, KeyChainImplWebCrypto as crypto, KeyName, PrivateKey, PublicKey, ValidityPeriod } from "@ndn/keychain";
import { Component, Data, Interest, Name } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";

import { CMD_CHALLENGE, CMD_DOWNLOAD, CMD_NEW, CMD_PROBE, CMD_PROBEINFO } from "../an";
import { CaInfo, ChallengeDefinition, ChallengeRequest, ChallengeResponse, NewRequest, NewResponse, ProbeResponse } from "../json-types";
import { base64Encode, makeInterestParams, readDataPayload, saltFromString, signInterest } from "../util";
import { clientLogger as log } from "./mod";

interface Options {
  fw?: Forwarder;
}

/** NDNCERT client. */
export class Client {
  public readonly prefix: Name;
  public readonly title: string;
  public readonly probeKeys: ReadonlyArray<string>;
  private readonly se: SimpleEndpoint;

  /** Construct client from CA information. */
  public static async create(caInfo: CaInfo, opts: Options = {}): Promise<Client> {
    const certData = new Decoder(Buffer.from(caInfo.certificate, "base64")).decode(Data);
    const cert = new Certificate(certData);
    const publicKey = await Certificate.loadPublicKey(cert);
    return new Client(caInfo, cert, publicKey, opts);
  }

  private constructor(
      caInfo: CaInfo, public readonly cert: Certificate,
      public readonly publicKey: PublicKey, opts: Options,
  ) {
    this.prefix = new Name(caInfo["ca-prefix"]);
    this.title = caInfo["ca-info"];
    this.probeKeys = caInfo.probe.split("|");
    this.se = new SimpleEndpoint(opts.fw);
  }

  /**
   * Execute PROBE command to find requestable subject name.
   * @param value PROBE conditions expected by CA.
   */
  public async probe(value: Record<string, any>): Promise<Client.ProbeResult> {
    log.debug("PROBE request", value);
    const interest = new Interest(
      this.prefix.append(...CMD_PROBE), Interest.MustBeFresh,
      await makeInterestParams(value));
    const data = await this.consume(interest);
    const json = (await readDataPayload(data.content)) as ProbeResponse;
    const res = new Client.ProbeResult(new Name(json.name), Data.getWire(data));
    log.debug("PROBE response", res.subjectName.toString());
    return res;
  }

  /** Request a certificate. */
  public async request(opts: Client.RequestOptions): Promise<Certificate> {
    if (opts.probeResult) {
      if (!opts.probeResult.subjectName.equals(KeyName.from(opts.privateKey.name).subjectName)) {
        throw new Error("SubjectName does not match probe result");
      }
    }
    const validity = opts.validityPeriod instanceof ValidityPeriod ? opts.validityPeriod :
                     ValidityPeriod.daysFromNow(opts.validityPeriod ?? 1);
    const selfSignedCert = await Certificate.selfSign({
      privateKey: opts.privateKey,
      publicKey: opts.publicKey,
      validity,
    });
    const { publicKey: ecdhPubC, privateKey: ecdhPvtC } =
      await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);

    log.debug("NEW request", selfSignedCert.name.toString());
    const newReq = {
      "ecdh-pub": base64Encode(new Uint8Array(await crypto.subtle.exportKey("raw", ecdhPubC))),
      "cert-request": base64Encode(Encoder.encode(selfSignedCert.data)),
      "probe-token": opts.probeResult?.probeToken,
    } as NewRequest;
    const newInterest = await signInterest(new Interest(
      this.prefix.append(...CMD_NEW), Interest.MustBeFresh,
      await makeInterestParams(newReq)), opts.privateKey);
    const newData = await this.consume(newInterest);
    const newRes = (await readDataPayload(newData.content)) as NewResponse;
    log.debug("NEW response", newRes["request-id"]);
    const reqId = Component.from(newRes["request-id"]);

    const ecdhPubS = await crypto.subtle.importKey("raw", Buffer.from(newRes["ecdh-pub"], "base64"), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    const hkdfRaw = await crypto.subtle.deriveBits({ name: "ECDH", public: ecdhPubS }, ecdhPvtC, 256);
    const hkdfKey = await crypto.subtle.importKey("raw", hkdfRaw, "HKDF", false, ["deriveKey"]);
    const aesKey = await crypto.subtle.deriveKey({ name: "HKDF", salt: saltFromString(newRes.salt), info: Uint8Array.of(0xF0, 0xF1, 0xF2, 0xF3, 0xF4, 0xF5, 0xF6, 0xF7, 0xF8, 0xF9), hash: "SHA-256" } as any, hkdfKey, { name: "AES-CBC", length: 256 }, false, ["encrypt", "decrypt"]);

    let challengeReq = await opts.startChallenge(newRes.challenges);
    const challengeId = challengeReq["selected-challenge"];
    while (true) {
      log.debug("CHALLENGE request", challengeReq);
      const challengeInterest = await signInterest(new Interest(
        this.prefix.append(...CMD_CHALLENGE, reqId), Interest.MustBeFresh,
        await makeInterestParams(challengeReq, aesKey)), opts.privateKey);
      const challengeData = await this.consume(challengeInterest);
      const challengeRes = (await readDataPayload(challengeData.content, aesKey)) as ChallengeResponse;
      log.debug("CHALLENGE response", challengeRes);
      if (challengeRes.status === "3") {
        break;
      } else if (challengeRes.status === "4") {
        throw new Error("request failed");
      }
      challengeReq = await opts.continueChallenge(challengeRes["challenge-status"], challengeId);
    }

    const downloadInterest = new Interest(this.prefix.append(...CMD_DOWNLOAD, reqId), Interest.MustBeFresh);
    const downloadData = await this.consume(downloadInterest);
    const certData = new Decoder(downloadData.content).decode(Data);
    await this.publicKey.verify(certData);
    log.debug("DOWNLOAD", certData.name.toString());
    return new Certificate(certData);
  }

  private async consume(interest: Interest): Promise<Data> {
    const data = await this.se.consume(interest);
    await this.publicKey.verify(data);
    return data;
  }
}

export namespace Client {
  /**
   * Gather information about a CA.
   * Application should validate CA certificate before using the client.
   */
  export async function gatherInfo(prefix: Name, opts: Options = {}): Promise<Client> {
    const se = new SimpleEndpoint(opts.fw);
    const data = await se.consume(new Interest(prefix.append(...CMD_PROBEINFO), Interest.MustBeFresh));
    const caInfo = (await readDataPayload(data.content)) as CaInfo;
    const client = await Client.create(caInfo, opts);
    await client.publicKey.verify(data);
    return client;
  }

  /** Probe command result. */
  export class ProbeResult {
    constructor(public readonly subjectName: Name, private readonly topTlv: Uint8Array) {
    }

    public get probeToken() {
      return base64Encode(this.topTlv);
    }
  }

  /** Certificate request options. */
  export interface RequestOptions {
    /** Private key corresponding to publicKey. */
    privateKey: PrivateKey;
    /** Public key to request certificate for. */
    publicKey: PublicKey;
    /** PROBE command result, if available. */
    probeResult?: ProbeResult;
    /** ValidityPeriod, or validity days from now. */
    validityPeriod?: ValidityPeriod|number;
    /** Callback to select and start challenge. */
    startChallenge: (challenges: ReadonlyArray<ChallengeDefinition>) => Promise<ChallengeRequest>;
    /** Callback to continue challenge. */
    continueChallenge: (challengeStatus: string, challengeId: string) => Promise<ChallengeRequest>;
  }
}
