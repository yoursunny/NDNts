import { Data, type Signer } from "@ndn/packet";
import { type EncodableTlv, Encoder, EvDecoder } from "@ndn/tlv";
import { toUtf8 } from "@ndn/util";

import * as crypto from "../crypto-common";
import { TT } from "./an";
import type { CaProfile } from "./ca-profile";
import * as decode_common from "./decode-common";
import type { NewRequest } from "./new-request";

const EVD = new EvDecoder<NewResponse.Fields>("NewResponse")
  .add(TT.EcdhPub, (t, { value }) => t.ecdhPubRaw = value, { required: true })
  .add(TT.Salt, (t, { value }) => t.salt = value, { required: true })
  .add(TT.RequestId, (t, { value }) => t.requestId = value, { required: true })
  .add(TT.Challenge, (t, { text }) => t.challenges.push(text), { required: true, repeat: true });
EVD.beforeObservers.push((t) => t.challenges = []);

/** NEW response packet. */
export class NewResponse {
  public static async fromData(data: Data, profile: CaProfile): Promise<NewResponse> {
    await profile.publicKey.verify(data);
    return decode_common.fromData(data, EVD, async (f) => {
      crypto.checkSalt(f.salt);
      crypto.checkRequestId(f.requestId);
      const ecdhPub = await crypto.importEcdhPub(f.ecdhPubRaw);
      return new NewResponse(data, ecdhPub);
    });
  }

  private constructor(
      public readonly data: Data,
      public readonly ecdhPub: CryptoKey,
  ) {}
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
