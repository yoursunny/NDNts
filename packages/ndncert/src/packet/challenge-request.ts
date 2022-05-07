import type { NamedSigner, NamedVerifier } from "@ndn/keychain";
import { type LLDecrypt, type LLEncrypt, type SignedInterestPolicy, Component, Interest } from "@ndn/packet";
import { Decoder, Encoder, EvDecoder } from "@ndn/tlv";
import { toUtf8 } from "@ndn/util";

import * as crypto from "../crypto-common";
import { C, TT } from "./an";
import type { CaProfile } from "./ca-profile";
import * as decode_common from "./decode-common";
import * as encrypted_payload from "./encrypted";
import * as parameter_kv from "./parameter-kv";

interface RequestInfo {
  sessionKey: Pick<crypto.SessionKey, "sessionDecrypter">;
  certRequestPub: NamedVerifier.PublicKey;
}

const EVD = new EvDecoder<ChallengeRequest.Fields>("ChallengeRequest")
  .add(TT.SelectedChallenge, (t, { text }) => t.selectedChallenge = text, { order: 1, required: true });
parameter_kv.parseEvDecoder(EVD, 2);

/** CHALLENGE request packet. */
export class ChallengeRequest {
  public static async fromInterest(interest: Interest, {
    profile,
    signedInterestPolicy,
    lookupRequest,
  }: ChallengeRequest.Context): Promise<ChallengeRequest> {
    decode_common.checkName(interest, profile, C.CHALLENGE, undefined, undefined);
    await interest.validateParamsDigest(true);

    const requestId = interest.name.get(-2)!.value;
    crypto.checkRequestId(requestId);
    const context = await lookupRequest(requestId);
    if (!context) {
      throw new Error("unknown requestId");
    }
    const { sessionKey: { sessionDecrypter }, certRequestPub } = context;
    await signedInterestPolicy.makeVerifier(certRequestPub).verify(interest);

    const { plaintext } = await sessionDecrypter.llDecrypt({
      ...encrypted_payload.decode(interest.appParameters!),
      additionalData: requestId,
    });
    return new ChallengeRequest(interest, plaintext);
  }

  private constructor(public readonly interest: Interest, plaintext: Uint8Array) {
    EVD.decodeValue(this, new Decoder(plaintext));
  }

  public get requestId() { return this.interest.name.at(-2).value; }
}
export interface ChallengeRequest extends Readonly<ChallengeRequest.Fields> {}

export namespace ChallengeRequest {
  interface ContextBase {
    profile: CaProfile;
    signedInterestPolicy: SignedInterestPolicy;
  }

  export interface Context extends ContextBase {
    lookupRequest: (requestId: Uint8Array) => Promise<RequestInfo | undefined>;
  }

  export interface Fields {
    selectedChallenge: string;
    parameters: parameter_kv.ParameterKV;
  }

  export interface Options extends ContextBase, Fields {
    requestId: Uint8Array;
    sessionEncrypter: LLEncrypt.Key;
    sessionLocalDecrypter: LLDecrypt.Key;
    publicKey: NamedVerifier.PublicKey;
    privateKey: NamedSigner.PrivateKey;
  }

  export async function build({
    profile,
    signedInterestPolicy,
    requestId,
    sessionEncrypter,
    sessionLocalDecrypter,
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
    interest.name = profile.prefix.append(C.CA, C.CHALLENGE, new Component(undefined, requestId));
    interest.mustBeFresh = true;
    interest.appParameters = encrypted_payload.encode(
      await sessionEncrypter.llEncrypt({ plaintext: payload, additionalData: requestId }));
    await signedInterestPolicy.makeSigner(privateKey).sign(interest);
    return ChallengeRequest.fromInterest(interest, {
      profile,
      signedInterestPolicy,
      lookupRequest: () => Promise.resolve({
        sessionKey: { sessionDecrypter: sessionLocalDecrypter },
        certRequestPub: publicKey,
      }),
    });
  }
}
