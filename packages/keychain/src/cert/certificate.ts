import { Component, Data, Name, SigInfo, Signer } from "@ndn/packet";
import * as asn1 from "@yoursunny/asn1";
import assert from "minimalistic-assert";

import { EncryptionAlgorithmList, SigningAlgorithmList } from "../algo/mod";
import { createEncrypter, CryptoAlgorithm, NamedEncrypter, NamedSigner, NamedVerifier, PublicKey } from "../key/mod";
import { createVerifier } from "../key/signing";
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

  /** Public key in SubjectPublicKeyInfo (SPKI) binary format. */
  public get publicKeySpki(): Uint8Array {
    return this.data.content;
  }

  /** Import SPKI as public key. */
  public async importPublicKey<I, A extends CryptoAlgorithm<I>>(
      algoList: readonly A[],
  ): Promise<[A, CryptoAlgorithm.PublicKey<I>]> {
    const der = asn1.parseVerbose(this.publicKeySpki);
    for (const algo of algoList) {
      if (!algo.importSpki) {
        continue;
      }
      try {
        return [algo, await algo.importSpki(this.publicKeySpki, der)];
      } catch {}
    }
    throw new Error("cannot import key");
  }

  /** Create verifier from SPKI. */
  public async createVerifier(algoList = SigningAlgorithmList): Promise<NamedVerifier.PublicKey> {
    if (!this.verifier) {
      const [algo, key] = await this.importPublicKey(algoList);
      this.verifier = createVerifier(CertNaming.toKeyName(this.name), algo, key);
    }
    return this.verifier;
  }

  /** Create encrypter from SPKI. */
  public async createEncrypter(algoList = EncryptionAlgorithmList): Promise<NamedEncrypter.PublicKey> {
    if (!this.encrypter) {
      const [algo, key] = await this.importPublicKey(algoList);
      this.encrypter = createEncrypter(CertNaming.toKeyName(this.name), algo, key);
    }
    return this.encrypter;
  }

  private verifier?: NamedVerifier.PublicKey;
  private encrypter?: NamedEncrypter.PublicKey;
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

  export async function issue(opts: IssueOptions): Promise<Certificate> {
    let { issuerPrivateKey: pvt, issuerId, publicKey: { name, spki } } = opts;
    name = CertNaming.makeCertName(name, { issuerId });
    if (!spki) {
      throw new Error("options.publicKey.spki unavailable");
    }
    return build({ ...opts, name, publicKeySpki: spki, signer: pvt });
  }

  export interface SelfSignOptions {
    freshness?: number;
    validity?: ValidityPeriod;
    privateKey: NamedSigner;
    publicKey: PublicKey;
  }

  export async function selfSign(opts: SelfSignOptions): Promise<Certificate> {
    const { privateKey: { name: pvtName }, publicKey: { name: pubName } } = opts;
    if (!pvtName.equals(pubName)) {
      throw new Error("key pair mismatch");
    }
    return issue({
      validity: ValidityPeriod.MAX,
      ...opts,
      issuerId: CertNaming.ISSUER_SELF,
      issuerPrivateKey: opts.privateKey,
    });
  }
}
