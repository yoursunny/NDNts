import { Data, FwHint, type LLDecrypt, type LLEncrypt, Name, type Signer, TT as l3TT } from "@ndn/packet";
import { Decoder, type Encodable, Encoder, EvDecoder, NNI } from "@ndn/tlv";
import { toUtf8 } from "@ndn/util";

import { Status, TT } from "./an";
import type { CaProfile } from "./ca-profile";
import type { ChallengeRequest } from "./challenge-request";
import * as encrypted_payload from "./encrypted";
import * as parameter_kv from "./parameter-kv";

const EVD = new EvDecoder<ChallengeResponse.Fields>("ChallengeResponse")
  .add(TT.Status, (t, { nni }) => t.status = NNI.constrain(nni, "Status", Status.MIN, Status.MAX),
    { order: 1, required: true })
  .add(TT.ChallengeStatus, (t, { text }) => t.challengeStatus = text, { order: 2 })
  .add(TT.RemainingTries, (t, { nni }) => t.remainingTries = nni, { order: 3 })
  .add(TT.RemainingTime, (t, { nni }) => t.remainingTime = nni * 1000, { order: 4 })
  .add(TT.IssuedCertName, (t, { vd }) => t.issuedCertName = vd.decode(Name), { order: 6 })
  .add(l3TT.ForwardingHint, (t, { vd }) => t.fwHint = FwHint.decodeValue(vd), { order: 7 });
parameter_kv.parseEvDecoder(EVD, 5);

/** CHALLENGE response packet. */
export class ChallengeResponse {
  public static async fromData(data: Data, profile: CaProfile, requestId: Uint8Array,
      sessionDecrypter: LLDecrypt.Key): Promise<ChallengeResponse> {
    await profile.publicKey.verify(data);

    const { plaintext } = await sessionDecrypter.llDecrypt({
      ...encrypted_payload.decode(data.content),
      additionalData: requestId,
    });
    return new ChallengeResponse(data, plaintext);
  }

  private constructor(public readonly data: Data, plaintext: Uint8Array) {
    EVD.decodeValue(this, new Decoder(plaintext));
    checkFieldsByStatus(this);
  }
}
export interface ChallengeResponse extends Readonly<ChallengeResponse.Fields> {}

function checkFieldsByStatus({
  status,
  challengeStatus,
  remainingTries,
  remainingTime,
  parameters,
  issuedCertName,
  fwHint,
}: ChallengeResponse.Fields): () => Encodable[] {
  switch (status) {
    case Status.FAILURE: {
      return () => [];
    }
    case Status.SUCCESS: {
      if (!issuedCertName) {
        throw new Error("issuedCertName missing");
      }
      return () => [
        [TT.IssuedCertName, issuedCertName],
        fwHint,
      ];
    }
    default: {
      if (!challengeStatus || !remainingTries || !remainingTime) {
        throw new Error("challengeStatus, remainingTries, remainingTime missing");
      }
      return () => [
        [TT.ChallengeStatus, toUtf8(challengeStatus)],
        [TT.RemainingTries, NNI(remainingTries)],
        [TT.RemainingTime, NNI(remainingTime / 1000)],
        ...parameter_kv.encode(parameters),
      ];
    }
  }
}

export namespace ChallengeResponse {
  export interface Fields {
    status: Status;
    challengeStatus?: string;
    remainingTries?: number;
    remainingTime?: number; // milliseconds
    parameters?: parameter_kv.ParameterKV;
    issuedCertName?: Name;
    fwHint?: FwHint;
  }

  export interface Options extends Fields {
    profile: CaProfile;
    sessionEncrypter: LLEncrypt.Key;
    sessionLocalDecrypter: LLDecrypt.Key;
    request: ChallengeRequest;
    signer: Signer;
  }

  export async function build(opts: Options): Promise<ChallengeResponse> {
    const {
      profile,
      sessionEncrypter,
      sessionLocalDecrypter,
      request: { requestId, interest: { name } },
      status,
      signer,
    } = opts;
    const tlvs = checkFieldsByStatus(opts)();
    tlvs.unshift([TT.Status, NNI(status)]);
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
