import { type Component, Data, type Name, SigInfo, type Signer, ValidityPeriod } from "@ndn/packet";
import { assert } from "@ndn/util";
import * as asn1 from "@yoursunny/asn1";

import type { CryptoAlgorithm, NamedSigner, PublicKey } from "./key/mod";
import * as CertNaming from "./naming";

const ContentTypeKEY = 0x02;

/**
 * NDN Certificate v2.
 *
 * @remarks
 * This type is immutable.
 */
export class Certificate {
  /**
   * Construct Certificate from Data packet.
   *
   * @throws Error
   * Thrown if the Data packet is not a certificate.
   */
  public static fromData(data: Data): Certificate {
    const { name, contentType, sigInfo: { validity } } = data;
    assert(CertNaming.isCertName(name), `${name} is not a certificate name`);
    assert(contentType === ContentTypeKEY, "ContentType must be KEY");
    assert(validity, "ValidityPeriod is missing");
    return new Certificate(data, validity);
  }

  private constructor(public readonly data: Data, public readonly validity: ValidityPeriod) {}

  /** Certificate name aka Data packet name. */
  public get name() { return this.data.name; }

  /** KeyLocator name, if present. */
  public get issuer(): Name | undefined {
    return this.data.sigInfo.keyLocator?.name;
  }

  /**
   * Whether this is a self-signed certificate.
   *
   * @remarks
   * A certificate is considered self-signed if its issuer key name is same as the certificate's
   * key name, i.e. they are the same key.
   */
  public get isSelfSigned(): boolean {
    return !!this.issuer &&
      CertNaming.toKeyName(this.issuer).equals(CertNaming.toKeyName(this.name));
  }

  /**
   * Ensure certificate is within validity period.
   *
   * @throws Error
   * Certificate has expired as of `now`.
   */
  public checkValidity(now: ValidityPeriod.TimestampInput = Date.now()): void {
    if (!this.validity.includes(now)) {
      throw new Error(`certificate ${this.name} has expired`);
    }
  }

  /** Public key in SubjectPublicKeyInfo (SPKI) binary format. */
  public get publicKeySpki(): Uint8Array {
    return this.data.content;
  }

  /**
   * Import SPKI as public key.
   * @param algoList - Algorithm list, such as {@link SigningAlgorithmListSlim}.
   */
  public async importPublicKey<I, A extends CryptoAlgorithm<I>>(
      algoList: readonly A[],
  ): Promise<[A, CryptoAlgorithm.PublicKey<I>]> {
    const der = asn1.parseVerbose(this.publicKeySpki);
    const errs: Record<string, unknown> = {};
    for (const algo of algoList) {
      if (!algo.importSpki) {
        continue;
      }
      try {
        return [algo, await algo.importSpki(this.publicKeySpki, der)];
      } catch (err: unknown) {
        errs[algo.uuid] = err;
      }
    }
    const errorMsgs = Object.entries(errs).map(([uuid, err]) => `  ${uuid} ${err}`);
    throw new AggregateError(Object.values(errs),
      `cannot import key\n${errorMsgs.join("\n")}\n(you may need to specify an algoList with more algorithms)`);
  }
}

export namespace Certificate {
  /** {@link Certificate.build} options. */
  export interface BuildOptions {
    /** Certificate name. */
    name: Name;

    /**
     * Certificate packet FreshnessPeriod.
     * @defaultValue 1 hour
     */
    freshness?: number;

    /** ValidityPeriod. */
    validity: ValidityPeriod;

    /** Public key in SubjectPublicKeyInfo (SPKI) binary format. */
    publicKeySpki: Uint8Array;

    /** Issuer signing key. */
    signer: Signer;
  }

  /** Build a certificate from fields. */
  export async function build({
    name,
    freshness = 3600000,
    validity,
    publicKeySpki,
    signer,
  }: BuildOptions): Promise<Certificate> {
    assert(CertNaming.isCertName(name));
    const data = new Data();
    data.name = name;
    data.contentType = ContentTypeKEY;
    data.freshnessPeriod = freshness;
    data.sigInfo = new SigInfo(validity);
    data.content = publicKeySpki;
    await signer.sign(data);
    return Certificate.fromData(data);
  }

  /** {@link Certificate.issue} options. */
  export interface IssueOptions {
    /**
     * Certificate packet FreshnessPeriod.
     * @defaultValue 1 hour
     */
    freshness?: number;

    /** ValidityPeriod. */
    validity: ValidityPeriod;

    /** IssuerId in certificate name. */
    issuerId: Component;

    /** Issuer signing key. */
    issuerPrivateKey: Signer;

    /** Public key to appear in certificate. */
    publicKey: PublicKey;
  }

  /** Create a certificated signed by issuer. */
  export async function issue(opts: IssueOptions): Promise<Certificate> {
    let { issuerPrivateKey: signer, issuerId, publicKey: { name, spki } } = opts;
    name = CertNaming.makeCertName(name, { issuerId });
    if (!spki) {
      throw new Error("options.publicKey.spki unavailable");
    }
    return build({ ...opts, name, publicKeySpki: spki, signer });
  }

  /** {@link Certificate.selfSign} options. */
  export interface SelfSignOptions {
    /**
     * Certificate packet FreshnessPeriod.
     * @defaultValue 1 hour
     */
    freshness?: number;

    /**
     * ValidityPeriod
     * @defaultValue `ValidityPeriod.MAX`
     */
    validity?: ValidityPeriod;

    /** Private key corresponding to public key. */
    privateKey: NamedSigner;

    /** Public key to appear in certificate. */
    publicKey: PublicKey;
  }

  /** Create a self-signed certificate. */
  export async function selfSign(opts: SelfSignOptions): Promise<Certificate> {
    const { privateKey, publicKey: { name: pubName } } = opts;
    if (!privateKey.name.equals(pubName)) {
      throw new Error("key pair mismatch");
    }
    return issue({
      validity: ValidityPeriod.MAX,
      ...opts,
      issuerId: CertNaming.ISSUER_SELF,
      issuerPrivateKey: privateKey,
    });
  }
}
