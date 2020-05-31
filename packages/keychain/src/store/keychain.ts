import { Name, Signer } from "@ndn/packet";

import { Certificate } from "../cert/mod";
import { PrivateKey, PublicKey } from "../key/mod";
import { CertificateName, KeyName } from "../name";
import { CertStore, KeyStore, SCloneCertStore } from "./mod";
import { openStores } from "./platform/mod";
import { MemoryStoreImpl } from "./store-impl";

/** Storage of own private keys and certificates. */
export abstract class KeyChain {
  /**
   * Return whether KeyStore supports structured clone of CryptoKey.
   * If this returns false, StoredKey must contain JsonWebKey instead of CryptoKey.
   */
  abstract readonly canSCloneKeys: boolean;

  /** List keys, filtered by name prefix. */
  abstract listKeys(prefix?: Name): Promise<Name[]>;

  /** Retrieve key pair by key name. */
  abstract getKeyPair(name: Name): Promise<[PrivateKey, PublicKey]>;

  /** Retrieve private key by key name. */
  public async getPrivateKey(name: Name): Promise<PrivateKey> {
    return (await this.getKeyPair(name))[0];
  }

  /** Retrieve public key by key name. */
  public async getPublicKey(name: Name): Promise<PublicKey> {
    return (await this.getKeyPair(name))[1];
  }

  /** Insert key pair. */
  abstract insertKey(name: Name, stored: KeyStore.StoredKey): Promise<void>;

  /** Delete key pair and associated certificates. */
  abstract deleteKey(name: Name): Promise<void>;

  /** List certificates, filtered by name prefix. */
  abstract listCerts(prefix?: Name): Promise<Name[]>;

  /** Retrieve certificate by cert name. */
  abstract getCert(name: Name): Promise<Certificate>;

  /** Insert certificate; key must exist. */
  abstract insertCert(cert: Certificate): Promise<void>;

  /** Delete certificate. */
  abstract deleteCert(name: Name): Promise<void>;

  /** Create a Signer by key name or certificate name. */
  public async createSigner(name: Name): Promise<Signer> {
    let keyName: KeyName|undefined;
    try { keyName = KeyName.from(name); } catch {}
    if (keyName) {
      return this.getPrivateKey(name);
    }

    const certName = CertificateName.from(name);
    const [key, cert] = await Promise.all([
      this.getPrivateKey(certName.keyName.name),
      this.getCert(name),
    ]);
    return key.withKeyLocator(cert.name);
  }
}

class KeyChainImpl extends KeyChain {
  constructor(private readonly keys: KeyStore, private readonly certs: CertStore) {
    super();
  }

  public get canSCloneKeys() { return this.keys.canSClone; }

  public async listKeys(prefix: Name = new Name()): Promise<Name[]> {
    return (await this.keys.list()).filter((n) => prefix.isPrefixOf(n));
  }

  public async getKeyPair(name: Name): Promise<[PrivateKey, PublicKey]> {
    return this.keys.get(name);
  }

  public async insertKey(name: Name, stored: KeyStore.StoredKey): Promise<void> {
    await this.keys.insert(name, stored);
  }

  public async deleteKey(name: Name): Promise<void> {
    const certs = await this.listCerts(name);
    await Promise.all(certs.map((cert) => this.certs.erase(cert)));
    await this.keys.erase(name);
  }

  public async listCerts(prefix: Name = new Name()): Promise<Name[]> {
    return (await this.certs.list()).filter((n) => prefix.isPrefixOf(n));
  }

  public async getCert(name: Name): Promise<Certificate> {
    return this.certs.get(name);
  }

  public async insertCert(cert: Certificate): Promise<void> {
    await this.getKeyPair(cert.certName.key); // ensure key exists
    await this.certs.insert(cert);
  }

  public async deleteCert(name: Name): Promise<void> {
    await this.certs.erase(name);
  }
}

export namespace KeyChain {
  /**
   * Open a persistent keychain.
   * @param locator in Node.js, a filesystem directory; in browser, a database name.
   */
  export function open(locator: string): KeyChain;

  /** Open a keychain from given KeyStore and CertStore. */
  export function open(keys: KeyStore, certs: CertStore): KeyChain;

  export function open(arg1: string|KeyStore, arg2?: CertStore): KeyChain {
    if (typeof arg1 === "string") {
      const [pvts, certs] = openStores(arg1);
      return new KeyChainImpl(pvts, certs);
    }
    return new KeyChainImpl(arg1, arg2!);
  }

  /** Create an in-memory ephemeral keychain. */
  export function createTemp(): KeyChain {
    return new KeyChainImpl(
      new KeyStore(new MemoryStoreImpl()),
      new SCloneCertStore(new MemoryStoreImpl()),
    );
  }
}
