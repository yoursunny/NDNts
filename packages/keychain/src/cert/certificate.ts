import { Version } from "@ndn/naming-convention2";
import { Component, Data, Name, SigInfo } from "@ndn/packet";

import { loadSpki } from "../key/load";
import { CertificateName, KeyName, PrivateKey, PublicKey } from "../mod";
import { ContentTypeKEY } from "./an";
import { ValidityPeriod } from "./mod";

/**
 * NDN Certificate v2.
 * This type is immutable.
 */
export class Certificate {
  public static fromData(data: Data): Certificate {
    const { name, contentType, sigInfo } = data;
    if (contentType !== ContentTypeKEY) {
      throw new Error("ContentType must be KEY");
    }
    if (!sigInfo) {
      throw new Error("SigInfo is missing");
    }
    const validity = ValidityPeriod.get(sigInfo);
    if (typeof validity === "undefined") {
      throw new Error("ValidityPeriod is missing");
    }
    const certName = CertificateName.from(name);
    const cert = new Certificate(data, certName, validity);
    return cert;
  }

  private constructor(
      public readonly data: Data,
      public readonly certName: CertificateName,
      public readonly validity: ValidityPeriod,
  ) {
  }

  public get name() { return this.data.name; }

  public get issuer(): Name|undefined {
    if (!this.data.sigInfo || !(this.data.sigInfo.keyLocator instanceof Name)) {
      return undefined;
    }
    return this.data.sigInfo.keyLocator;
  }

  public get isSelfSigned() {
    return this.issuer?.isPrefixOf(this.name) ?? false;
  }

  /** Public key in SubjectPublicKeyInfo binary format. */
  public get publicKeySpki() { return this.data.content; }

  /** Load public key. */
  public async loadPublicKey(): Promise<PublicKey> {
    if (!this.publicKey) {
      this.publicKey = await loadSpki(this.certName.key, this.publicKeySpki);
    }
    return this.publicKey;
  }

  private publicKey?: PublicKey;
}

const DEFAULT_FRESHNESS = 3600000;
const SELF_ISSUER = Component.from("self");

export namespace Certificate {
  export interface BuildOptions {
    name: CertificateName;
    freshness?: number;
    validity: ValidityPeriod;
    publicKeySpki: Uint8Array;
    signer: PrivateKey;
  }

  export async function build({
    name: { name },
    freshness = DEFAULT_FRESHNESS,
    validity,
    publicKeySpki,
    signer,
  }: BuildOptions): Promise<Certificate> {
    const data = new Data(name, Data.ContentType(ContentTypeKEY), Data.FreshnessPeriod(freshness));
    const si = new SigInfo();
    ValidityPeriod.set(si, validity);
    data.sigInfo = si;
    data.content = publicKeySpki;
    await signer.sign(data);
    return Certificate.fromData(data);
  }

  export interface IssueOptions {
    freshness?: number;
    validity: ValidityPeriod;
    issuerId: Component;
    issuerPrivateKey: PrivateKey;
    publicKey: PublicKey;
  }

  export async function issue(options: IssueOptions): Promise<Certificate> {
    if (!PublicKey.isExportable(options.publicKey)) {
      throw new Error("publicKey is not exportable");
    }
    const { issuerPrivateKey: pvt, issuerId, publicKey: pub } = options;
    const kn = KeyName.from(pub.name);
    const cn = new CertificateName(kn.subjectName, kn.keyId, issuerId, Version.create(Date.now()));
    const publicKeySpki = await pub.exportAsSpki();
    const opts: BuildOptions = { ...options, name: cn, publicKeySpki, signer: pvt };
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
      issuerId: SELF_ISSUER,
      issuerPrivateKey: options.privateKey,
    };
    return issue(opts);
  }
}
