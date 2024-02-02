import { Certificate, createVerifier, type NamedSigner, type NamedVerifier, type SigningAlgorithm, SigningAlgorithmListSlim, ValidityPeriod } from "@ndn/keychain";
import { Data, Interest, type SignedInterestPolicy } from "@ndn/packet";
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
   * @param algoList - List of recognized algorithms for certificate request.
   * Default is {@link SigningAlgorithmListSlim}.
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
  /** Contextual information to decode and verify NEW request packet. */
  export interface Context {
    /** CA profile packet. */
    profile: CaProfile;

    /** Signed Interest validation policy. */
    signedInterestPolicy: SignedInterestPolicy;
  }

  /** Fields of NEW request packet. */
  export interface Fields {
    /** Client ECDH public key. */
    ecdhPubRaw: Uint8Array;

    /** Client certificate request as self-signed certificate. */
    certRequest: Certificate;
  }

  /** Options to construct NEW request packet. */
  export interface Options extends Context {
    /** Client ECDH public key. */
    ecdhPub: CryptoKey;

    /** Certificate request public key. */
    publicKey: NamedVerifier.PublicKey;

    /** Certificate request private key. */
    privateKey: NamedSigner.PrivateKey;

    /**
     * Desired ValidityPeriod.
     *
     * @remarks
     * This will be truncated to maximum validity permitted by the CA profile.
     */
    validity?: ValidityPeriod;

    /**
     * List of recognized algorithms for certificate request.
     * @defaultValue `SigningAlgorithmListSlim`
     */
    algoList?: readonly SigningAlgorithm[];
  }

  /** Construct NEW request packet. */
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
