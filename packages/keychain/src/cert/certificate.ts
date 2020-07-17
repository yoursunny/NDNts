import { Component, Data, Name, SigInfo, Signer } from "@ndn/packet";
import assert from "minimalistic-assert";

import { loadSpki } from "../key/load";
import { PrivateKey, PublicKey } from "../key/mod";
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
    if (typeof validity === "undefined") {
      throw new Error("ValidityPeriod is missing");
    }
    const cert = new Certificate(data, validity);
    return cert;
  }

  private constructor(public readonly data: Data, public readonly validity: ValidityPeriod) {
  }

  public get name() { return this.data.name; }

  public get issuer(): Name|undefined {
    return this.data.sigInfo.keyLocator?.name;
  }

  public get isSelfSigned(): boolean {
    return this.issuer?.isPrefixOf(this.name) ?? false;
  }

  /** Public key in SubjectPublicKeyInfo binary format. */
  public get publicKeySpki(): Uint8Array {
    return this.data.content;
  }

  /** Load public key. */
  public async loadPublicKey(): Promise<PublicKey> {
    if (!this.publicKey) {
      this.publicKey = await loadSpki(CertNaming.toKeyName(this.name), this.publicKeySpki);
    }
    return this.publicKey;
  }

  private publicKey?: PublicKey;
}

const DEFAULT_FRESHNESS = 3600000;

export namespace Certificate {
  export interface BuildOptions {
    name: Name;
    freshness?: number;
    validity: ValidityPeriod;
    publicKeySpki: Uint8Array;
    signer: Signer;
  }

  export async function build({
    name,
    freshness = DEFAULT_FRESHNESS,
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
    freshness?: number;
    validity: ValidityPeriod;
    issuerId: Component;
    issuerPrivateKey: Signer;
    publicKey: PublicKey;
  }

  export async function issue(options: IssueOptions): Promise<Certificate> {
    if (!PublicKey.isExportable(options.publicKey)) {
      throw new Error("publicKey is not exportable");
    }
    const { issuerPrivateKey: pvt, issuerId, publicKey: pub } = options;
    const name = CertNaming.makeCertName(pub.name, { issuerId });
    const publicKeySpki = await pub.exportAsSpki();
    const opts: BuildOptions = { ...options, name, publicKeySpki, signer: pvt };
    return build(opts);
  }

  export interface SelfSignOptions {
    freshness?: number;
    validity?: ValidityPeriod;
    privateKey: PrivateKey;
    publicKey: PublicKey;
  }

  export async function selfSign(options: SelfSignOptions): Promise<Certificate> {
    const { privateKey: { name: pvtName }, publicKey: { name: pubName } } = options;
    if (!pvtName.equals(pubName)) {
      throw new Error("key pair mismatch");
    }
    const opts: IssueOptions = {
      validity: ValidityPeriod.MAX,
      ...options,
      issuerId: CertNaming.ISSUER_SELF,
      issuerPrivateKey: options.privateKey,
    };
    return issue(opts);
  }
}
