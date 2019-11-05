import { Data, LLSign, SigInfo } from "@ndn/l3pkt";
import { Component } from "@ndn/name";
import { Version } from "@ndn/naming-convention2";

import { PrivateKey, PublicKey } from "../key";
import { importSpki } from "../key/import";
import { CertificateName, KeyName } from "../name";
import { ContentTypeKEY } from "./an";
import { ValidityPeriod } from "./validity-period";

/**
 * NDN Certificate v2.
 * This type is immutable.
 */
export class Certificate {
  public readonly certName: CertificateName;
  public readonly validity: ValidityPeriod;

  public get name() { return this.data.name; }

  /** Public key in SubjectPublicKeyInfo binary format. */
  public get publicKey() { return this.data.content; }

  constructor(public readonly data: Data) {
    this.certName = CertificateName.from(data.name);
    if (this.data.contentType !== ContentTypeKEY) {
      throw new Error("ContentType must be KEY");
    }
    const si = data.sigInfo;
    if (typeof si === "undefined") {
      throw new Error("SigInfo is missing");
    }
    const validity = ValidityPeriod.get(si);
    if (typeof validity === "undefined") {
      throw new Error("ValidityPeriod is missing");
    }
    this.validity = validity;
  }
}

const DEFAULT_FRESHNESS = 3600000;

export namespace Certificate {
  interface BuildOptions {
    name: CertificateName;
    freshness?: number;
    validity: ValidityPeriod;
    publicKey: Uint8Array;
    signer: PrivateKey;
  }

  export async function build({
      name,
      freshness = DEFAULT_FRESHNESS,
      validity,
      publicKey,
      signer,
    }: BuildOptions): Promise<Certificate> {
    const data = new Data(name.toName(), Data.ContentType(ContentTypeKEY), Data.FreshnessPeriod(freshness));
    const si = new SigInfo();
    ValidityPeriod.set(si, validity);
    data.sigInfo = si;
    data.content = publicKey;
    signer.sign(data);
    await data[LLSign.PROCESS]();
    return new Certificate(data);
  }

  interface IssueOptions extends Omit<BuildOptions, "name"|"publicKey"|"signer"> {
    issuerId: Component;
    issuerPrivateKey: PrivateKey;
    publicKey: PublicKey;
  }

  export async function issue(options: IssueOptions): Promise<Certificate> {
    const { issuerPrivateKey: pvt, issuerId, publicKey: pub } = options;
    const kn = KeyName.from(pub.name);
    const cn = new CertificateName(kn.subjectName, kn.keyId, issuerId, Version.create(Date.now()));
    const publicKey = await pub.exportAsSpki();
    const opt: BuildOptions = { ...options, name: cn, publicKey, signer: pvt };
    return await build(opt);
  }

  interface SelfSignOptions extends Omit<IssueOptions, "validity"|"issuerId"|"issuerPrivateKey"> {
    validity?: ValidityPeriod;
    privateKey: PrivateKey;
  }

  const SELF_ISSUER = Component.from("self");

  export async function selfSign(options: SelfSignOptions): Promise<Certificate> {
    const { privateKey: { name: pvtName }, publicKey: { name: pubName } } = options;
    if (!pvtName.equals(pubName)) {
      throw new Error("key pair mismatch");
    }
    const opt: IssueOptions = {
      validity: ValidityPeriod.MAX,
      ...options,
      issuerId: SELF_ISSUER,
      issuerPrivateKey: options.privateKey,
    };
    return await issue(opt);
  }

  export async function loadPublicKey(cert: Certificate): Promise<PublicKey> {
    return await importSpki(cert.certName.toKeyName().toName(), cert.publicKey);
  }
}
