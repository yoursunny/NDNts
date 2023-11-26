import type { NamedSigner, NamedVerifier } from "@ndn/keychain";
import { Component, Interest, type LLDecrypt, type LLEncrypt, type SignedInterestPolicy } from "@ndn/packet";
import { Decoder, Encoder, EvDecoder } from "@ndn/tlv";
import { toUtf8 } from "@ndn/util";
import { type Promisable } from "type-fest";

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
  /** Decode CHALLENGE request from Interest packet. */
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
    /** CA profile packet. */
    profile: CaProfile;

    /** Signed Interest validation policy. */
    signedInterestPolicy: SignedInterestPolicy;
  }

  /** Contextual information to decode and verify CHALLENGE request packet. */
  export interface Context extends ContextBase {
    /**
     * Callback to locate request session.
     * @param requestId request session ID.
     * @returns request session information, or undefined if not found.
     */
    lookupRequest: (requestId: Uint8Array) => Promisable<RequestInfo | undefined>;
  }

  /** Fields of CHALLENGE request packet. */
  export interface Fields {
    /** Selected challenge type. */
    selectedChallenge: string;

    /** Challenge parameter key-value pairs. */
    parameters: parameter_kv.ParameterKV;
  }

  /** Options to construct CHALLENGE request packet. */
  export interface Options extends ContextBase, Fields {
    /** Request session ID. */
    requestId: Uint8Array;

    /**
     * Request session encrypter.
     * @see makeSessionKey
     */
    sessionEncrypter: LLEncrypt.Key;

    /**
     * Request session local decrypter.
     * @see makeSessionKey
     */
    sessionLocalDecrypter: LLDecrypt.Key;

    /** Certificate request public key. */
    publicKey: NamedVerifier.PublicKey;

    /** Certificate request private key. */
    privateKey: NamedSigner.PrivateKey;
  }

  /** Construct CHALLENGE request packet. */
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
      lookupRequest: () => ({
        sessionKey: { sessionDecrypter: sessionLocalDecrypter },
        certRequestPub: publicKey,
      }),
    });
  }
}
