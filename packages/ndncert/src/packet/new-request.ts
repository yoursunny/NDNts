import { type NamedSigner, type NamedVerifier, type SigningAlgorithm, Certificate, createVerifier, SigningAlgorithmListSlim, ValidityPeriod } from "@ndn/keychain";
import { type SignedInterestPolicy, Data, Interest } from "@ndn/packet";
import { Encoder, EvDecoder } from "@ndn/tlv";

import * as crypto from "../crypto-common";
import { C, TT } from "./an";
import type { CaProfile } from "./ca-profile";
import * as decode_common from "./decode-common";

const EVD = new EvDecoder<NewRequest.Fields>("NewRequest")
  .add(TT.EcdhPub, (t, { value }) => t.ecdhPubRaw = value, { required: true })
  .add(TT.CertRequest, (t, { vd }) => t.certRequest = Certificate.fromData(vd.decode(Data)), { required: true });

/** NEW request packet. */
export class NewRequest {
  /**
   * Decode NEW request from Interest packet.
   * @param algoList list of recognized algorithms for certificate request.
   */
  public static fromInterest(
      interest: Interest,
      { profile, signedInterestPolicy }: NewRequest.Context,
      algoList = SigningAlgorithmListSlim,
  ): Promise<NewRequest> {
    decode_common.checkName(interest, profile, C.NEW, undefined);
    return decode_common.fromInterest(interest, EVD, async (f) => {
      const { validity } = f.certRequest;
      if (!validity.equals(truncateValidity(validity, profile, true))) {
        throw new Error("bad ValidityPeriod");
      }

      const ecdhPub = await crypto.importEcdhPub(f.ecdhPubRaw);
      const publicKey = await createVerifier(f.certRequest, { algoList });
      await signedInterestPolicy.makeVerifier(publicKey).verify(interest);
      return new NewRequest(interest, ecdhPub, publicKey);
    });
  }

  private constructor(
      public readonly interest: Interest,
      public readonly ecdhPub: CryptoKey,
      public readonly publicKey: NamedVerifier.PublicKey,
  ) {}
}
export interface NewRequest extends Readonly<NewRequest.Fields> {}

function truncateValidity(
    validity: ValidityPeriod,
    {
      maxValidityPeriod,
      cert: { validity: caValidity },
    }: CaProfile,
    enableNotBeforeGracePeriod: boolean): ValidityPeriod {
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
    algoList?: readonly SigningAlgorithm[];
  }

  export async function build({
    profile,
    signedInterestPolicy,
    ecdhPub,
    publicKey,
    privateKey,
    validity = ValidityPeriod.MAX,
    algoList = SigningAlgorithmListSlim,
  }: Options) {
    validity = truncateValidity(validity, profile, false);
    if (!validity.includes(Date.now())) {
      throw new Error("bad ValidityPeriod (requester certificate or CA certificate expired?)");
    }
    const certRequest = await Certificate.selfSign({
      publicKey,
      privateKey,
      validity,
    });

    const payload = Encoder.encode([
      [TT.EcdhPub, await crypto.exportEcdhPub(ecdhPub)],
      [TT.CertRequest, certRequest.data],
    ]);

    const interest = new Interest();
    interest.name = profile.prefix.append(C.CA, C.NEW);
    interest.mustBeFresh = true;
    interest.appParameters = payload;
    await signedInterestPolicy.makeSigner(privateKey).sign(interest);
    return NewRequest.fromInterest(interest, { profile, signedInterestPolicy }, algoList);
  }
}
