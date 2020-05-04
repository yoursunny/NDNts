import { Certificate, PrivateKey, PublicKey, ValidityPeriod } from "@ndn/keychain";
import { Data, Interest, SigInfo } from "@ndn/packet";
import { Decoder, Encoder, EvDecoder } from "@ndn/tlv";

import * as crypto from "../crypto-common";
import { TT, Verb } from "./an";
import { CaProfile } from "./ca-profile";

const EVD = new EvDecoder<NewRequest.Fields>("NewRequest", undefined)
  .add(TT.EcdhPub, (t, { value }) => t.ecdhPubRaw = value, { required: true })
  .add(TT.CertRequest, (t, { vd }) => t.certRequest = Certificate.fromData(vd.decode(Data)), { required: true });

export class NewRequest {
  public static async fromInterest(interest: Interest, profile: CaProfile): Promise<NewRequest> {
    if (!(interest.name.getPrefix(-2).equals(profile.prefix) &&
          interest.name.at(-2).equals(Verb.NEW))) {
      throw new Error("bad Name");
    }
    if (typeof interest.sigInfo?.nonce === "undefined" || typeof interest.sigInfo.time === "undefined") {
      throw new Error("bad SigInfo");
    }

    const request = new NewRequest(interest);
    const { validity } = request.certRequest;
    if (!validity.equals(truncateValidity(validity, profile, true))) {
      throw new Error("bad ValidityPeriod");
    }

    request.ecdhPub_ = await crypto.importEcdhPub(request.ecdhPubRaw);
    request.publicKey_ = await request.certRequest.loadPublicKey();
    await request.publicKey.verify(interest);
    return request;
  }

  private constructor(public readonly interest: Interest) {
    if (!interest.appParameters) {
      throw new Error("ApplicationParameter is missing");
    }
    EVD.decodeValue(this, new Decoder(interest.appParameters));
  }

  private ecdhPub_!: CryptoKey;
  public get ecdhPub() { return this.ecdhPub_; }

  private publicKey_!: PublicKey;
  public get publicKey() { return this.publicKey_; }
}
export interface NewRequest extends Readonly<NewRequest.Fields> {}

function truncateValidity(
    { notBefore, notAfter }: ValidityPeriod,
    {
      maxValidityPeriod,
      cert: { validity: { notBefore: caNotBefore, notAfter: caNotAfter } },
    }: CaProfile,
    enableNotBeforeGracePeriod = false): ValidityPeriod {
  const now = Date.now();
  const notBeforeT = Math.max(
    notBefore.getTime(),
    now - (enableNotBeforeGracePeriod ? 120000 : 0),
    caNotBefore.getTime(),
  );
  const notAfterT = Math.min(
    notAfter.getTime(),
    now + maxValidityPeriod,
    caNotAfter.getTime(),
  );
  return new ValidityPeriod(new Date(notBeforeT), new Date(notAfterT));
}

export namespace NewRequest {
  export interface Fields {
    ecdhPubRaw: Uint8Array;
    certRequest: Certificate;
  }

  export interface Options {
    profile: CaProfile;
    ecdhPub: CryptoKey;
    publicKey: PublicKey;
    privateKey: PrivateKey;
    validity?: ValidityPeriod;
  }

  export async function build({
    profile,
    ecdhPub,
    publicKey,
    privateKey,
    validity = ValidityPeriod.MAX,
  }: Options) {
    const certRequest = await Certificate.selfSign({
      publicKey,
      privateKey,
      validity: truncateValidity(validity, profile),
    });

    const payload = Encoder.encode([
      [TT.EcdhPub, await crypto.exportEcdhPub(ecdhPub)],
      [TT.CertRequest, certRequest.data],
    ]);

    const interest = new Interest();
    interest.name = profile.prefix.append(Verb.NEW);
    interest.mustBeFresh = true;
    interest.appParameters = payload;
    interest.sigInfo = new SigInfo(SigInfo.Nonce(), SigInfo.Time());
    await privateKey.sign(interest);
    return NewRequest.fromInterest(interest, profile);
  }
}
