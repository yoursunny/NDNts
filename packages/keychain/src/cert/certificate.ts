import { type Component, Data, type Name, SigInfo, type Signer } from "@ndn/packet";
import { assert } from "@ndn/util";
import * as asn1 from "@yoursunny/asn1";

import type { CryptoAlgorithm, NamedSigner, PublicKey } from "../key/mod";
import * as CertNaming from "../naming";
import { ContentTypeKEY } from "./an";
import { ValidityPeriod } from "./validity-period";

/**
 * NDN Certificate v2.
 * This type is immutable.
 */
export class Certificate {
  public static fromData(data: Data): Certificate {
    const { name, contentType, sigInfo } = data;
    if (!CertNaming.isCertName(name)) {
      throw new Error(`${name} is not a certificate name`);
    }
    if (contentType !== ContentTypeKEY) {
      throw new Error("ContentType must be KEY");
    }
    const validity = ValidityPeriod.get(sigInfo);
    if (!validity) {
      throw new Error("ValidityPeriod is missing");
    }
    const cert = new Certificate(data, validity);
    return cert;
  }

  private constructor(public readonly data: Data, public readonly validity: ValidityPeriod) {}

  public get name() { return this.data.name; }

  public get issuer(): Name | undefined {
    return this.data.sigInfo.keyLocator?.name;
  }

  public get isSelfSigned(): boolean {
    return this.issuer?.isPrefixOf(this.name) ?? false;
  }

  /** Ensure certificate is within validity period. */
  public checkValidity(now: ValidityPeriod.TimestampInput = Date.now()): void {
    if (!this.validity.includes(now)) {
      throw new Error(`certificate ${this.name} has expired`);
    }
  }

  /** Public key in SubjectPublicKeyInfo (SPKI) binary format. */
  public get publicKeySpki(): Uint8Array {
    return this.data.content;
  }

  /** Import SPKI as public key. */
  public async importPublicKey<I, A extends CryptoAlgorithm<I>>(
      algoList: readonly A[],
  ): Promise<[A, CryptoAlgorithm.PublicKey<I>]> {
    const der = asn1.parseVerbose(this.publicKeySpki);
    const errs: string[] = [];
    for (const algo of algoList) {
      if (!algo.importSpki) {
        continue;
      }
      try {
        return [algo, await algo.importSpki(this.publicKeySpki, der)];
      } catch (err: unknown) {
        errs.push(`${algo.uuid}: ${err}`);
      }
    }
    throw new Error(`cannot import key\n${errs.join("\n")}\n(you may need to specify an algoList with more algorithms)`);
  }
}

export namespace Certificate {
  export interface BuildOptions {
    /** Certificate name. */
    name: Name;
    /** Certificate packet FreshnessPeriod, default is 1 hour. */
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
    const data = new Data(name, Data.ContentType(ContentTypeKEY), Data.FreshnessPeriod(freshness));
    data.sigInfo = new SigInfo();
    ValidityPeriod.set(data.sigInfo, validity);
    data.content = publicKeySpki;
    await signer.sign(data);
    return Certificate.fromData(data);
  }

  export interface IssueOptions {
    /** Certificate packet FreshnessPeriod, default is 1 hour. */
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

  export interface SelfSignOptions {
    /** Certificate packet FreshnessPeriod, default is 1 hour. */
    freshness?: number;
    /** ValidityPeriod, default is maximum validity. */
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
