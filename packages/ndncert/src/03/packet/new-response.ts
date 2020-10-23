import { Data, Signer } from "@ndn/packet";
import { Decoder, EncodableTlv, Encoder, EvDecoder, toUtf8 } from "@ndn/tlv";

import * as crypto from "../crypto-common";
import { TT } from "./an";
import type { CaProfile } from "./ca-profile";
import type { NewRequest } from "./new-request";

const EVD = new EvDecoder<NewResponse.Fields>("NewResponse", undefined)
  .add(TT.EcdhPub, (t, { value }) => t.ecdhPubRaw = value, { required: true })
  .add(TT.Salt, (t, { value }) => t.salt = value, { required: true })
  .add(TT.RequestId, (t, { value }) => t.requestId = value, { required: true })
  .add(TT.Challenge, (t, { text }) => t.challenges.push(text), { required: true, repeat: true });

/** NEW response packet. */
export class NewResponse {
  public static async fromData(data: Data, profile: CaProfile): Promise<NewResponse> {
    await profile.publicKey.verify(data);

    const response = new NewResponse(data);
    crypto.checkSalt(response.salt);
    crypto.checkRequestId(response.requestId);
    response.ecdhPub_ = await crypto.importEcdhPub(response.ecdhPubRaw);
    return response;
  }

  private constructor(public readonly data: Data) {
    const self = this as NewResponse.Fields;
    self.challenges = [];
    EVD.decodeValue(self, new Decoder(data.content));
  }

  private ecdhPub_!: CryptoKey;
  public get ecdhPub() { return this.ecdhPub_; }
}
export interface NewResponse extends Readonly<NewResponse.Fields> {}

export namespace NewResponse {
  export interface Fields {
    ecdhPubRaw: Uint8Array;
    salt: Uint8Array;
    requestId: Uint8Array;
    challenges: string[];
  }

  export type Options = Omit<Fields, "ecdhPubRaw"> & {
    profile: CaProfile;
    request: NewRequest;
    ecdhPub: CryptoKey;
    signer: Signer;
  };

  export async function build({
    profile,
    request: { interest: { name } },
    ecdhPub,
    salt,
    requestId,
    challenges,
    signer,
  }: Options): Promise<NewResponse> {
    const payload = Encoder.encode([
      [TT.EcdhPub, await crypto.exportEcdhPub(ecdhPub)],
      [TT.Salt, salt],
      [TT.RequestId, requestId],
      ...challenges.map((challenge): EncodableTlv => [TT.Challenge, toUtf8(challenge)]),
    ]);

    const data = new Data();
    data.name = name;
    data.freshnessPeriod = 4000;
    data.content = payload;
    await signer.sign(data);
    return NewResponse.fromData(data, profile);
  }
}
