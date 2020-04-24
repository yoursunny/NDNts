import { Certificate, CertificateName, KeyChain, KeyChainImplWebCrypto as crypto, KeyName, KeyStore, PrivateKey, PublicKey, ValidityPeriod } from "@ndn/keychain";
import { Component, Data, Name } from "@ndn/packet";
import { Decodable, Decoder, Encoder } from "@ndn/tlv";
import execa from "execa";
import throat from "throat";

import { SafeBag } from "./safe-bag";

const IMPORTING_ISSUER = Component.from("08c5a687-7be5-43ee-a966-2683fb339c1d");
const PASSPHRASE = "PASSPHRASE";

/** Access ndn-cxx KeyChain. */
export class NdnsecKeyChain implements KeyChain {
  constructor();

  constructor(home: string);

  constructor(pibLocator: string, tpmLocator: string);

  constructor(arg1?: string, arg2?: string) {
    if (arg2) {
      this.env.NDN_CLIENT_PIB = arg1;
      this.env.NDN_CLIENT_TPM = arg2;
    } else if (arg1) {
      this.env.HOME = arg1;
    }
    this.env.NDN_NAME_ALT_URI = "0";
  }

  private readonly env: NodeJS.ProcessEnv = {};

  private async invokeNdnsec(argv: string[], input?: Uint8Array): Promise<{
    lines: string[];
    decode<R>(d: Decodable<R>): R;
  }> {
    const { stdout } = await execa("ndnsec", argv, {
      input: input ? Buffer.from(input).toString("base64") : undefined,
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
        const certName = CertificateName.from(new Name(line.split(" ").pop()));
        const keyName = certName.toKeyName();
        const certList = keyCerts.get(keyName.toName().toString());
        if (typeof certList !== "undefined" && !certName.issuerId.equals(IMPORTING_ISSUER)) {
          certList.push(certName.toName().toString());
        }
      }
    }

    for (const keyName of keyCerts.keys()) {
      const { subjectName } = KeyName.from(new Name(keyName));
      const exported = await this.invokeNdnsec(["export", "-P", PASSPHRASE, "-i", `${subjectName}`]);
      const safeBag = exported.decode(SafeBag);
      await safeBag.saveKeyPair(PASSPHRASE, dest);
    }

    for (const certList of keyCerts.values()) {
      for (const certName of certList) {
        const certdump = await this.invokeNdnsec(["cert-dump", "-n", certName]);
        const data = certdump.decode(Data);
        await dest.insertCert(new Certificate(data));
      }
    }

    return dest;
  }

  private mutex = throat(1);
  private cached?: KeyChain;
  private async load() {
    if (!this.cached) {
      this.cached = await this.copyTo(KeyChain.createTemp());
    }
    return this.cached;
  }

  public readonly canSCloneKeys = false;

  public async listKeys(prefix = new Name()): Promise<Name[]> {
    return this.mutex(async () => {
      const keyChain = await this.load();
      return keyChain.listKeys(prefix);
    });
  }

  public async getKeyPair(name: Name): Promise<[PrivateKey, PublicKey]> {
    return this.mutex(async () => {
      const keyChain = await this.load();
      return keyChain.getKeyPair(name);
    });
  }

  public async getPrivateKey(name: Name): Promise<PrivateKey> {
    return this.mutex(async () => {
      const keyChain = await this.load();
      return keyChain.getPrivateKey(name);
    });
  }

  public async getPublicKey(name: Name): Promise<PublicKey> {
    return this.mutex(async () => {
      const keyChain = await this.load();
      return keyChain.getPublicKey(name);
    });
  }

  public async insertKey(name: Name, stored: KeyStore.StoredKey): Promise<void> {
    return this.mutex(async () => {
      const { cryptoPvt, privateKey, publicKey } = await KeyStore.loadFromStored(name, stored, true);
      const selfSigned = await Certificate.issue({
        publicKey,
        validity: ValidityPeriod.MAX,
        issuerPrivateKey: privateKey,
        issuerId: IMPORTING_ISSUER,
      });
      const pvt = await crypto.subtle.exportKey("pkcs8", cryptoPvt);
      const safeBag = SafeBag.create(selfSigned, new Uint8Array(pvt), PASSPHRASE);
      await this.invokeNdnsec(["import", "-P", PASSPHRASE, "-i-"], Encoder.encode(safeBag));
    });
  }

  public async deleteKey(name: Name): Promise<void> {
    return this.mutex(async () => {
      await this.invokeNdnsec(["delete", "-k", name.toString()]);
      this.cached = undefined;
    });
  }

  public async listCerts(prefix = new Name()): Promise<Name[]> {
    return this.mutex(async () => {
      const keyChain = await this.load();
      return keyChain.listCerts(prefix);
    });
  }

  public async getCert(name: Name): Promise<Certificate> {
    return this.mutex(async () => {
      const keyChain = await this.load();
      return keyChain.getCert(name);
    });
  }

  public async insertCert(cert: Certificate): Promise<void> {
    return this.mutex(async () => {
      await this.invokeNdnsec(["cert-install", "-K", "-f-"], Encoder.encode(cert.data));
      this.cached = undefined;
    });
  }

  public async deleteCert(name: Name): Promise<void> {
    return this.mutex(async () => {
      await this.invokeNdnsec(["delete", "-c", name.toString()]);
      this.cached = undefined;
    });
  }
}
