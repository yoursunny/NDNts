import { Certificate, CertNaming, type CryptoAlgorithm, ECDSA, KeyChain, KeyChainSerialized, KeyStore, RSA, RSAOAEP } from "@ndn/keychain";
import { Component, Data, Name, NameMap, ValidityPeriod } from "@ndn/packet";
import { type Decodable, Decoder, Encoder } from "@ndn/tlv";
import { crypto } from "@ndn/util";
import { execa, execaSync } from "execa";

import { SafeBag } from "./safe-bag";

const IMPORTING_ISSUER = Component.from("08c5a687-7be5-43ee-a966-2683fb339c1d");
const PASSPHRASE = "PASSPHRASE";
const ALGO_LIST = [ECDSA, RSA, RSAOAEP];

let ndnsecInstalled: boolean | undefined;

/** Access ndn-cxx KeyChain. */
export class NdnsecKeyChain extends KeyChainSerialized {
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
    super();
    if (pibLocator && tpmLocator) {
      this.env.NDN_CLIENT_PIB = pibLocator;
      this.env.NDN_CLIENT_TPM = tpmLocator;
    } else if (home) {
      this.env.HOME = home;
    }
    this.importOptions = importOptions;
  }

  public override readonly needJwk = true;
  private readonly env: NodeJS.ProcessEnv = { NDN_NAME_ALT_URI: "0" };
  private readonly importOptions?: SafeBag.ImportOptions;
  private cached?: KeyChain;
  private readonly insertKeyLoader = new KeyStore.Loader(true, ALGO_LIST);

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
  public async copyTo(dest: KeyChain): Promise<KeyChain> {
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

  private async load() {
    return (this.cached ??= await this.copyTo(KeyChain.createTemp(ALGO_LIST)));
  }

  protected override async sListKeys(prefix: Name): Promise<Name[]> {
    const keyChain = await this.load();
    return keyChain.listKeys(prefix);
  }

  protected override async sGetKeyPair(name: Name): Promise<KeyChain.KeyPair> {
    const keyChain = await this.load();
    return keyChain.getKeyPair(name);
  }

  protected override async sInsertKey(name: Name, stored: KeyStore.StoredKey): Promise<void> {
    const keyPair = await this.insertKeyLoader.loadKey(name, stored);

    const selfSigned = await Certificate.issue({
      publicKey: keyPair.publicKey,
      validity: ValidityPeriod.MAX,
      issuerPrivateKey: keyPair.signer,
      issuerId: IMPORTING_ISSUER,
    });
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey(
      "pkcs8", (keyPair.pvt as CryptoAlgorithm.PrivateKey).privateKey));

    const safeBag = await SafeBag.create(selfSigned, pkcs8, PASSPHRASE);
    await this.invokeNdnsec(["import", "-P", PASSPHRASE, "-i-"], Encoder.encode(safeBag));
    delete this.cached;
  }

  protected override async sDeleteKey(name: Name): Promise<void> {
    await this.invokeNdnsec(["delete", "-k", name.toString()]);
    delete this.cached;
  }

  protected override async sListCerts(prefix: Name): Promise<Name[]> {
    const keyChain = await this.load();
    return keyChain.listCerts(prefix);
  }

  protected override async sGetCert(name: Name): Promise<Certificate> {
    const keyChain = await this.load();
    return keyChain.getCert(name);
  }

  protected override async sInsertCert(cert: Certificate): Promise<void> {
    await this.invokeNdnsec(["cert-install", "-K", "-f-"], Encoder.encode(cert.data));
    delete this.cached;
  }

  protected override async sDeleteCert(name: Name): Promise<void> {
    await this.invokeNdnsec(["delete", "-c", name.toString()]);
    delete this.cached;
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
     * @see {@link https://docs.named-data.net/ndn-cxx/0.8.1/manpages/ndn-client.conf.html#key-management}
     */
    pibLocator?: string;

    /**
     * ndn-cxx TPM locator.
     *
     * @remarks
     * This must be specified together with `.pibLocator`.
     * @see {@link https://docs.named-data.net/ndn-cxx/0.8.1/manpages/ndn-client.conf.html#key-management}
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
