import { Name } from "@ndn/packet";

import { StoredKey } from "../key/save";
import { Certificate, PrivateKey, PublicKey } from "../mod";
import { CertStore, KeyStore, SCloneCertStore } from "./mod";
import { openStores } from "./platform/mod";
import { MemoryStoreImpl } from "./store-impl";

/** Storage of own private keys and certificates. */
export interface KeyChain {
  /**
   * Return whether KeyStore supports structured clone of CryptoKey.
   * If this returns false, StoredKey must contain JsonWebKey instead of CryptoKey.
   */
  readonly canSCloneKeys: boolean;

  /** List keys, filtered by name prefix. */
  listKeys(prefix?: Name): Promise<Name[]>;

  /** Retrieve key pair by key name. */
  getKeyPair(name: Name): Promise<[PrivateKey, PublicKey]>;

  /** Retrieve private key by key name. */
  getPrivateKey(name: Name): Promise<PrivateKey>;

  /** Retrieve public key by key name. */
  getPublicKey(name: Name): Promise<PublicKey>;

  /** Insert key pair. */
  insertKey(name: Name, stored: StoredKey): Promise<void>;

  /** Delete key pair and associated certificates. */
  deleteKey(name: Name): Promise<void>;

  /** List certificates, filtered by name prefix. */
  listCerts(prefix?: Name): Promise<Name[]>;

  /** Retrieve certificate by cert name. */
  getCert(name: Name): Promise<Certificate>;

  /** Insert certificate; key must exist. */
  insertCert(cert: Certificate): Promise<void>;

  /** Delete certificate. */
  deleteCert(name: Name): Promise<void>;
}

class KeyChainImpl implements KeyChain {
  constructor(private readonly keys: KeyStore, private readonly certs: CertStore) {
  }

  public get canSCloneKeys() { return this.keys.canSClone; }

  public async listKeys(prefix: Name = new Name()): Promise<Name[]> {
    return (await this.keys.list()).filter((n) => prefix.isPrefixOf(n));
  }

  public async getKeyPair(name: Name): Promise<[PrivateKey, PublicKey]> {
    return this.keys.get(name);
  }

  public async getPrivateKey(name: Name): Promise<PrivateKey> {
    return (await this.getKeyPair(name))[0];
  }

  public async getPublicKey(name: Name): Promise<PublicKey> {
    return (await this.getKeyPair(name))[1];
  }

  public async insertKey(name: Name, stored: StoredKey): Promise<void> {
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
    const keyName = cert.certName.toKeyName().toName();
    await this.getKeyPair(keyName); // ensure key exists
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
