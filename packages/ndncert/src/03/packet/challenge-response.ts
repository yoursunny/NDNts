import { Data, LLDecrypt, LLEncrypt, Name, Signer } from "@ndn/packet";
import { Decoder, EncodableTlv, Encoder, EvDecoder, NNI, toUtf8 } from "@ndn/tlv";

import { Status, TT } from "./an";
import type { CaProfile } from "./ca-profile";
import type { ChallengeRequest } from "./challenge-request";
import * as encrypted_payload from "./encrypted";

const EVD = new EvDecoder<ChallengeResponse.Fields>("ChallengeResponse", undefined)
  .add(TT.Status, (t, { nni }) => t.status = NNI.constrain(nni, "Status", Status.MIN, Status.MAX), { required: true })
  .add(TT.ChallengeStatus, (t, { text }) => t.challengeStatus = text)
  .add(TT.RemainingTries, (t, { nni }) => t.remainingTries = nni)
  .add(TT.RemainingTime, (t, { nni }) => t.remainingTime = nni * 1000)
  .add(TT.IssuedCertName, (t, { vd }) => t.issuedCertName = vd.decode(Name));

/** CHALLENGE response packet. */
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
    checkFields(this);
  }
}
export interface ChallengeResponse extends Readonly<ChallengeResponse.Fields> {}

function checkFields({
  status,
  challengeStatus,
  remainingTries,
  remainingTime,
  issuedCertName,
}: ChallengeResponse.Fields) {
  if (status === Status.SUCCESS) {
    if (!issuedCertName) {
      throw new Error("issuedCertName is required for Status.SUCCESS");
    }
  } else if (!challengeStatus || !remainingTries || !remainingTime) {
    throw new Error("challengeStatus, remainingTries, and remainingTime are required for !Status.SUCCESS");
  }
}

export namespace ChallengeResponse {
  export interface Fields {
    status: Status;
    challengeStatus?: string;
    remainingTries?: number;
    remainingTime?: number; // milliseconds
    issuedCertName?: Name;
  }

  export interface Options extends Fields {
    profile: CaProfile;
    sessionEncrypter: LLEncrypt.Key;
    sessionLocalDecrypter: LLDecrypt.Key;
    request: ChallengeRequest;
    signer: Signer;
  }

  export async function build(opts: Options): Promise<ChallengeResponse> {
    checkFields(opts);
    const {
      profile,
      sessionEncrypter,
      sessionLocalDecrypter,
      request: { requestId, interest: { name } },
      status,
      challengeStatus,
      remainingTries,
      remainingTime,
      issuedCertName,
      signer,
    } = opts;
    const tlvs: EncodableTlv[] = [
      [TT.Status, NNI(status)],
    ];
    if (status === Status.SUCCESS) {
      tlvs.push([TT.IssuedCertName, issuedCertName]);
    } else {
      tlvs.push(
        [TT.ChallengeStatus, toUtf8(challengeStatus!)],
        [TT.RemainingTries, NNI(remainingTries!)],
        [TT.RemainingTime, NNI(remainingTime! / 1000)],
      );
    }
    const payload = Encoder.encode(tlvs);

    const data = new Data();
    data.name = name;
    data.freshnessPeriod = 4000;
    data.content = encrypted_payload.encode(
      await sessionEncrypter.llEncrypt({ plaintext: payload, additionalData: requestId }));
    await signer.sign(data);
    return ChallengeResponse.fromData(data, profile, requestId, sessionLocalDecrypter);
  }
}
