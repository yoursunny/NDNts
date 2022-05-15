import { type CryptoAlgorithm, Certificate, CertNaming, ECDSA, KeyChain, KeyStore, RSA, RSAOAEP, ValidityPeriod } from "@ndn/keychain";
import { Component, Data, Name } from "@ndn/packet";
import { type Decodable, Decoder, Encoder } from "@ndn/tlv";
import { crypto } from "@ndn/util";
import { execa } from "execa";
import throat from "throat";

import { SafeBag } from "./safe-bag";

const IMPORTING_ISSUER = Component.from("08c5a687-7be5-43ee-a966-2683fb339c1d");
const PASSPHRASE = "PASSPHRASE";
const ALGO_LIST = [ECDSA, RSA, RSAOAEP];

/** Access ndn-cxx KeyChain. */
export class NdnsecKeyChain extends KeyChain {
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
  private readonly mutex = throat(1);
  private cached?: KeyChain;
  private readonly insertKeyLoader = new KeyStore.Loader(true, ALGO_LIST);

  private async invokeNdnsec(argv: string[], input?: Uint8Array): Promise<{
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
        return new Decoder(wire).decode(d);
      },
    };
  }

  /** Copy keys and certificates to another keychain. */
  public async copyTo(dest: KeyChain): Promise<KeyChain> {
    const { lines } = await this.invokeNdnsec(["list", "-c"]);
    const keyCerts = new Map<string, string[]>();
    for (const line of lines) {
      if (line.startsWith("  +->*")) {
        const keyName = line.split(" ").pop()!;
        keyCerts.set(keyName, []);
      } else if (line.startsWith("       +->")) {
        const certName = new Name(line.split(" ").pop());
        const { issuerId, keyName } = CertNaming.parseCertName(certName);
        const certList = keyCerts.get(keyName.toString());
        if (certList !== undefined && !issuerId.equals(IMPORTING_ISSUER)) {
          certList.push(certName.toString());
        }
      }
    }

    for (const keyName of keyCerts.keys()) {
      const { subjectName } = CertNaming.parseKeyName(new Name(keyName));
      const exported = await this.invokeNdnsec(["export", "-P", PASSPHRASE, "-i", `${subjectName}`]);
      const safeBag = exported.decode(SafeBag);
      await safeBag.saveKeyPair(PASSPHRASE, dest, this.importOptions);
    }

    for (const certList of keyCerts.values()) {
      for (const certName of certList) {
        const certDump = await this.invokeNdnsec(["cert-dump", "-n", certName]);
        await dest.insertCert(Certificate.fromData(certDump.decode(Data)));
      }
    }

    return dest;
  }

  private async load() {
    if (!this.cached) {
      this.cached = await this.copyTo(KeyChain.createTemp(ALGO_LIST));
    }
    return this.cached;
  }

  public override async listKeys(prefix = new Name()): Promise<Name[]> {
    return this.mutex(async () => {
      const keyChain = await this.load();
      return keyChain.listKeys(prefix);
    });
  }

  public override async getKeyPair(name: Name): Promise<KeyChain.KeyPair> {
    return this.mutex(async () => {
      const keyChain = await this.load();
      return keyChain.getKeyPair(name);
    });
  }

  public override async insertKey(name: Name, stored: KeyStore.StoredKey): Promise<void> {
    return this.mutex(async () => {
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
    });
  }

  public override async deleteKey(name: Name): Promise<void> {
    return this.mutex(async () => {
      await this.invokeNdnsec(["delete", "-k", name.toString()]);
      delete this.cached;
    });
  }

  public override async listCerts(prefix = new Name()): Promise<Name[]> {
    return this.mutex(async () => {
      const keyChain = await this.load();
      return keyChain.listCerts(prefix);
    });
  }

  public override async getCert(name: Name): Promise<Certificate> {
    return this.mutex(async () => {
      const keyChain = await this.load();
      return keyChain.getCert(name);
    });
  }

  public override async insertCert(cert: Certificate): Promise<void> {
    return this.mutex(async () => {
      await this.invokeNdnsec(["cert-install", "-K", "-f-"], Encoder.encode(cert.data));
      delete this.cached;
    });
  }

  public override async deleteCert(name: Name): Promise<void> {
    return this.mutex(async () => {
      await this.invokeNdnsec(["delete", "-c", name.toString()]);
      delete this.cached;
    });
  }
}

export namespace NdnsecKeyChain {
  export interface Options {
    /**
     * ndn-cxx PIB locator.
     * This must be specified together with tpmLocator.
     * @see https://named-data.net/doc/ndn-cxx/0.8.0/manpages/ndn-client.conf.html#key-management
     */
    pibLocator?: string;

    /**
     * ndn-cxx TPM locator.
     * This must be specified together with pibLocator.
     * @see https://named-data.net/doc/ndn-cxx/0.8.0/manpages/ndn-client.conf.html#key-management
     */
    tpmLocator?: string;

    /**
     * HOME environment variable to pass to ndnsec command.
     * ndn-cxx will derive PIB locator and TPM locator from HOME environment variable.
     * This is ignored when both pibLocator and tpmLocator are specified.
     */
    home?: string;

    /** SafeBag import options. */
    importOptions?: SafeBag.ImportOptions;
  }
}
