import { Certificate, NamedSigner, NamedVerifier, ValidityPeriod } from "@ndn/keychain";
import { Data, Interest, SignedInterestPolicy } from "@ndn/packet";
import { Decoder, Encoder, EvDecoder } from "@ndn/tlv";

import * as crypto from "../crypto-common";
import { TT, Verb } from "./an";
import type { CaProfile } from "./ca-profile";

const EVD = new EvDecoder<NewRequest.Fields>("NewRequest", undefined)
  .add(TT.EcdhPub, (t, { value }) => t.ecdhPubRaw = value, { required: true })
  .add(TT.CertRequest, (t, { vd }) => t.certRequest = Certificate.fromData(vd.decode(Data)), { required: true });

/** NEW request packet. */
export class NewRequest {
  public static async fromInterest(interest: Interest, { profile, signedInterestPolicy }: NewRequest.Context): Promise<NewRequest> {
    if (!(interest.name.getPrefix(-2).equals(profile.prefix) &&
          interest.name.at(-2).equals(Verb.NEW))) {
      throw new Error("bad Name");
    }

    const request = new NewRequest(interest);
    const { validity } = request.certRequest;
    if (!validity.equals(truncateValidity(validity, profile, true))) {
      throw new Error("bad ValidityPeriod");
    }

    request.ecdhPub_ = await crypto.importEcdhPub(request.ecdhPubRaw);
    request.publicKey_ = await request.certRequest.createVerifier();
    await signedInterestPolicy.makeVerifier(request.publicKey).verify(interest);
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

  private publicKey_!: NamedVerifier.PublicKey;
  public get publicKey() { return this.publicKey_; }
}
export interface NewRequest extends Readonly<NewRequest.Fields> {}

function truncateValidity(
    validity: ValidityPeriod,
    {
      maxValidityPeriod,
      cert: { validity: caValidity },
    }: CaProfile,
    enableNotBeforeGracePeriod = false): ValidityPeriod {
  const now = Date.now();
  return validity.intersect(
    caValidity,
    new ValidityPeriod(now - (enableNotBeforeGracePeriod ? 120000 : 0), now + maxValidityPeriod),
  );
}

export namespace NewRequest {
  export interface Context {
    profile: CaProfile;
    signedInterestPolicy: SignedInterestPolicy;
  }

  export interface Fields {
    ecdhPubRaw: Uint8Array;
    certRequest: Certificate;
  }

  export interface Options extends Context {
    ecdhPub: CryptoKey;
    publicKey: NamedVerifier.PublicKey;
    privateKey: NamedSigner.PrivateKey;
    validity?: ValidityPeriod;
  }

  export async function build({
    profile,
    signedInterestPolicy,
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
    await signedInterestPolicy.makeSigner(privateKey).sign(interest);
    return NewRequest.fromInterest(interest, { profile, signedInterestPolicy });
  }
}
