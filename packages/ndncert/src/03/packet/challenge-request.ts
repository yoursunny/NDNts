import { NamedSigner, NamedVerifier } from "@ndn/keychain";
import { Component, Interest, LLDecrypt, LLEncrypt, SigInfo } from "@ndn/packet";
import { Decoder, Encoder, EvDecoder, toUtf8 } from "@ndn/tlv";

import * as crypto from "../crypto-common";
import { TT, Verb } from "./an";
import type { CaProfile } from "./ca-profile";
import * as encrypted_payload from "./encrypted";
import * as parameter_kv from "./parameter-kv";

interface Context {
  sessionKey: Pick<crypto.SessionKey, "sessionDecrypter">;
  certRequestPub: NamedVerifier.PublicKey;
}

const EVD = new EvDecoder<ChallengeRequest.Fields>("ChallengeRequest", undefined)
  .add(TT.SelectedChallenge, (t, { text }) => t.selectedChallenge = text, { order: 1, required: true })
  .add(TT.ParameterKey, (t, { text }) => parameter_kv.parseKey(t.parameters, text), { order: 2, repeat: true })
  .add(TT.ParameterValue, (t, { value }) => parameter_kv.parseValue(t.parameters, value), { order: 2, repeat: true });

export class ChallengeRequest {
  public static async fromInterest(interest: Interest, profile: CaProfile,
      lookupContext: (requestId: Uint8Array) => Promise<Context|undefined>): Promise<ChallengeRequest> {
    if (!(interest.name.getPrefix(-3).equals(profile.prefix) &&
          interest.name.at(-3).equals(Verb.CHALLENGE))) {
      throw new Error("bad Name");
    }
    if (!interest.appParameters) {
      throw new Error("ApplicationParameter is missing");
    }
    if (typeof interest.sigInfo?.nonce === "undefined" || typeof interest.sigInfo.time === "undefined") {
      throw new Error("bad SigInfo");
    }

    const requestId = interest.name.at(-2).value;
    crypto.checkRequestId(requestId);
    const context = await lookupContext(requestId);
    if (!context) {
      throw new Error("unknown requestId");
    }
    const { sessionKey: { sessionDecrypter }, certRequestPub } = context;
    await certRequestPub.verify(interest);

    const { plaintext } = await sessionDecrypter.llDecrypt({
      ...encrypted_payload.decode(interest.appParameters),
      additionalData: requestId,
    });
    const request = new ChallengeRequest(interest, plaintext);
    return request;
  }

  private constructor(public readonly interest: Interest, plaintext: Uint8Array) {
    (this as ChallengeRequest.Fields).parameters = {};
    EVD.decodeValue(this, new Decoder(plaintext));
    parameter_kv.finish(this.parameters);
  }

  public get requestId() { return this.interest.name.at(-2).value; }
}
export interface ChallengeRequest extends Readonly<ChallengeRequest.Fields> {}

export namespace ChallengeRequest {
  export interface Fields {
    selectedChallenge: string;
    parameters: parameter_kv.ParameterKV;
  }

  export interface Options extends Fields {
    profile: CaProfile;
    requestId: Uint8Array;
    sessionEncrypter: LLEncrypt.Key;
    sessionDecrypter: LLDecrypt.Key;
    publicKey: NamedVerifier.PublicKey;
    privateKey: NamedSigner.PrivateKey;
  }

  export async function build({
    profile,
    requestId,
    sessionEncrypter,
    sessionDecrypter,
    publicKey,
    privateKey,
    selectedChallenge,
    parameters,
  }: Options): Promise<ChallengeRequest> {
    const payload = Encoder.encode([
      [TT.SelectedChallenge, toUtf8(selectedChallenge)],
      ...parameter_kv.encode(parameters),
    ]);

    const interest = new Interest();
    interest.name = profile.prefix.append(Verb.CHALLENGE, new Component(undefined, requestId));
    interest.mustBeFresh = true;
    interest.appParameters = encrypted_payload.encode(
      await sessionEncrypter.llEncrypt({ plaintext: payload, additionalData: requestId }));
    interest.sigInfo = new SigInfo(SigInfo.Nonce(), SigInfo.Time());
    await privateKey.sign(interest);
    return ChallengeRequest.fromInterest(interest, profile,
      () => Promise.resolve({ sessionKey: { sessionDecrypter }, certRequestPub: publicKey }));
  }
}
