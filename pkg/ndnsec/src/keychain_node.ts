import { Certificate, CertNaming, ECDSA, type KeyChain, KeyChainExternal, type KeyStore, RSA, RSAOAEP } from "@ndn/keychain";
import { Component, Data, Name, NameMap, ValidityPeriod } from "@ndn/packet";
import { type Decodable, Decoder, Encoder } from "@ndn/tlv";
import { assert } from "@ndn/util";
import { execa, execaSync } from "execa";

import { SafeBag } from "./safe-bag";

const IMPORTING_ISSUER = Component.from("08c5a687-7be5-43ee-a966-2683fb339c1d");
const PASSPHRASE = "PASSPHRASE";
const ALGO_LIST = [ECDSA, RSA, RSAOAEP];

let ndnsecInstalled: boolean | undefined;

/** Access ndn-cxx KeyChain. */
export class NdnsecKeyChain extends KeyChainExternal {
  /**
   * Whether current environment supports ndn-cxx KeyChain.
   *
   * @remarks
   * It checks whether `ndnsec` program is installed.
   */
  public static get supported(): boolean {
    return (ndnsecInstalled ??= execaSync("ndnsec", ["version"], { reject: false }).exitCode === 0);
  }

  constructor({
    pibLocator,
    tpmLocator,
    home,
    importOptions,
  }: NdnsecKeyChain.Options = {}) {
    super(ALGO_LIST);
    if (pibLocator && tpmLocator) {
      this.env.NDN_CLIENT_PIB = pibLocator;
      this.env.NDN_CLIENT_TPM = tpmLocator;
    } else if (home) {
      this.env.HOME = home;
    }
    this.importOptions = importOptions;
  }

  private readonly env: NodeJS.ProcessEnv = { NDN_NAME_ALT_URI: "0" };
  private readonly importOptions?: SafeBag.ImportOptions;

  private async invokeNdnsec(argv: readonly string[], input?: Uint8Array): Promise<{
    readonly lines: string[];
    decode: <R>(d: Decodable<R>) => R;
  }> {
    const { stdout } = await execa("ndnsec", argv, {
      input: input && Buffer.from(input).toString("base64"),
      stderr: "inherit",
      env: this.env,
    });
    return {
      get lines() { return stdout.split("\n"); },
      decode<R>(d: Decodable<R>): R {
        const wire = Buffer.from(stdout, "base64");
        return Decoder.decode(wire, d);
      },
    };
  }

  /** Copy keys and certificates to another keychain. */
  public override async copyTo(dest: KeyChain): Promise<KeyChain> {
    const { lines } = await this.invokeNdnsec(["list", "-c"]);
    const keyCerts = new NameMap<Name[]>();
    for (const line of lines) {
      const match = /\/\S*/.exec(line);
      if (!match) {
        continue;
      }
      const name = new Name(match[0]);
      if (CertNaming.isKeyName(name)) {
        keyCerts.set(name, []);
      } else if (CertNaming.isCertName(name)) {
        const { issuerId, keyName } = CertNaming.parseCertName(name);
        const certList = keyCerts.get(keyName);
        if (certList !== undefined && !issuerId.equals(IMPORTING_ISSUER)) {
          certList.push(name);
        }
      }
    }

    for (const [keyName, certList] of keyCerts) {
      const exported = await this.invokeNdnsec(["export", "-P", PASSPHRASE, "-k", `${keyName}`]);
      const safeBag = exported.decode(SafeBag);
      await safeBag.saveKeyPair(PASSPHRASE, dest, this.importOptions);
      for (const certName of certList) {
        const certDump = await this.invokeNdnsec(["cert-dump", "-n", `${certName}`]);
        await dest.insertCert(Certificate.fromData(certDump.decode(Data)));
      }
    }

    return dest;
  }

  protected override async eInsertKey({ publicKey, signer, pvt }: KeyStore.KeyPair): Promise<void> {
    const selfSigned = await Certificate.issue({
      publicKey,
      validity: ValidityPeriod.MAX,
      issuerPrivateKey: signer,
      issuerId: IMPORTING_ISSUER,
    });
    assert("privateKey" in pvt);
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pvt.privateKey));

    const safeBag = await SafeBag.create(selfSigned, pkcs8, PASSPHRASE);
    await this.invokeNdnsec(["import", "-P", PASSPHRASE, "-i-"], Encoder.encode(safeBag));
  }

  protected override async eDeleteKey(name: Name): Promise<void> {
    await this.invokeNdnsec(["delete", "-k", name.toString()]);
  }

  protected override async eInsertCert(cert: Certificate): Promise<void> {
    await this.invokeNdnsec(["cert-install", "-K", "-f-"], Encoder.encode(cert.data));
  }

  protected override async eDeleteCert(name: Name): Promise<void> {
    await this.invokeNdnsec(["delete", "-c", name.toString()]);
  }
}

export namespace NdnsecKeyChain {
  /** {@link NdnsecKeyChain} constructor options. */
  export interface Options {
    /**
     * ndn-cxx PIB locator.
     *
     * @remarks
     * This must be specified together with `.tpmLocator`.
     * @see {@link https://docs.named-data.net/ndn-cxx/0.9.0/manpages/ndn-client.conf.html#key-management}
     */
    pibLocator?: string;

    /**
     * ndn-cxx TPM locator.
     *
     * @remarks
     * This must be specified together with `.pibLocator`.
     * @see {@link https://docs.named-data.net/ndn-cxx/0.9.0/manpages/ndn-client.conf.html#key-management}
     */
    tpmLocator?: string;

    /**
     * HOME environment variable to pass to ndnsec command.
     *
     * @remarks
     * ndn-cxx will derive PIB locator and TPM locator from HOME environment variable.
     * This is ignored when both `.pibLocator` and `.tpmLocator` are specified.
     */
    home?: string;

    /** SafeBag import options. */
    importOptions?: SafeBag.ImportOptions;
  }
}
