import { Data, LLDecrypt, LLEncrypt, Name, Signer } from "@ndn/packet";
import { Decoder, Encoder, EvDecoder, NNI, toUtf8 } from "@ndn/tlv";

import { Status, TT } from "./an";
import type { CaProfile } from "./ca-profile";
import type { ChallengeRequest } from "./challenge-request";
import * as encrypted_payload from "./encrypted";

const EVD = new EvDecoder<ChallengeResponse.Fields>("ChallengeResponse", undefined)
  .add(TT.Status, (t, { nni }) => t.status = NNI.constrain(nni, "Status", Status.MAX, Status.MIN), { required: true })
  .add(TT.ChallengeStatus, (t, { text }) => t.challengeStatus = text, { required: true })
  .add(TT.RemainingTries, (t, { nni }) => t.remainingTries = nni, { required: true })
  .add(TT.RemainingTime, (t, { nni }) => t.remainingTime = nni * 1000, { required: true })
  .add(TT.IssuedCertName, (t, { vd }) => t.issuedCertName = vd.decode(Name));

export class ChallengeResponse {
  public static async fromData(data: Data, profile: CaProfile, requestId: Uint8Array,
      sessionDecrypter: LLDecrypt.Key): Promise<ChallengeResponse> {
    await profile.publicKey.verify(data);

    const { plaintext } = await sessionDecrypter.llDecrypt({
      ...encrypted_payload.decode(data.content),
      additionalData: requestId,
    });
    const request = new ChallengeResponse(data, plaintext);
    return request;
  }

  private constructor(public readonly data: Data, plaintext: Uint8Array) {
    EVD.decodeValue(this, new Decoder(plaintext));
  }
}
export interface ChallengeResponse extends Readonly<ChallengeResponse.Fields> {}

export namespace ChallengeResponse {
  export interface Fields {
    status: Status;
    challengeStatus: string;
    remainingTries: number;
    remainingTime: number; // milliseconds
    issuedCertName?: Name;
  }

  export interface Options extends Fields {
    profile: CaProfile;
    sessionEncrypter: LLEncrypt.Key;
    sessionDecrypter: LLDecrypt.Key;
    request: ChallengeRequest;
    signer: Signer;
  }

  export async function build({
    profile,
    sessionEncrypter,
    sessionDecrypter,
    request: { requestId, interest: { name } },
    status,
    challengeStatus,
    remainingTries,
    remainingTime,
    issuedCertName,
    signer,
  }: Options): Promise<ChallengeResponse> {
    const payload = Encoder.encode([
      [TT.Status, NNI(status)],
      [TT.ChallengeStatus, toUtf8(challengeStatus)],
      [TT.RemainingTries, NNI(remainingTries)],
      [TT.RemainingTime, NNI(remainingTime / 1000)],
      [TT.IssuedCertName, Encoder.OmitEmpty, issuedCertName],
    ]);

    const data = new Data();
    data.name = name;
    data.freshnessPeriod = 4000;
    data.content = encrypted_payload.encode(
      await sessionEncrypter.llEncrypt({ plaintext: payload, additionalData: requestId }));
    await signer.sign(data);
    return ChallengeResponse.fromData(data, profile, requestId, sessionDecrypter);
  }
}
