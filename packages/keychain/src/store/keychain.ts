import { Name, Signer } from "@ndn/packet";

import type { Certificate } from "../cert/mod";
import type { NamedSigner } from "../key/mod";
import * as CertNaming from "../naming";
import { CertStore } from "./cert-store";
import { KeyStore } from "./key-store";
import { MemoryStoreProvider } from "./store-provider";
import { openStores } from "./stores_node";

/** Storage of own private keys and certificates. */
export abstract class KeyChain {
  /** Return whether insertKey function expects JsonWebKey instead of CryptoKey. */
  abstract readonly needJwk: boolean;

  /** List keys, filtered by name prefix. */
  abstract listKeys(prefix?: Name): Promise<Name[]>;

  /** Retrieve key pair by key name. */
  abstract getKeyPair(name: Name): Promise<KeyChain.KeyPair>;

  /**
   * Retrieve key by key name.
   * @param typ "signer", "verifier", etc
   */
  public async getKey<K extends keyof KeyChain.KeyPair>(name: Name, typ: K): Promise<KeyChain.KeyPair[K]> {
    const keyPair = await this.getKeyPair(name);
    return keyPair[typ];
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

  /**
   * Create a signer from keys and certificates in the KeyChain.
   * @param name subject name, key name, or certificate name.
   *
   * @li If name is a certificate name, sign with the corresponding private key,
   *     and use the specified certificate name as KeyLocator.
   * @li If name is a key name, sign with the specified private key.
   *     If a non-self-signed certificate exists for this key, use the certificate name as KeyLocator.
   *     Otherwise, use the key name as KeyLocator.
   * @li If name is neither certificate name nor key name, it is interpreted as a subject name.
   *     A non-self-signed certificate of this subject name is preferred.
   *     If such a certificate does not exist, use any key of this subject name.
   * @li If prefixMatch is true, name can also be interpreted as a prefix of the subject name.
   */
  public async getSigner(
      name: Name,
      { prefixMatch = false, fallback, useKeyNameKeyLocator = false }: KeyChain.GetSignerOptions = {},
  ): Promise<Signer> {
    const useFallback = (err?: Error) => {
      switch (typeof fallback) {
        case "function":
          return fallback(name, this, err);
        case "undefined":
          throw new Error(`signer ${name} not found ${err}`);
        default:
          return fallback;
      }
    };
    const changeKeyLocator = (signer: NamedSigner, certName?: Name) => {
      if (certName && !useKeyNameKeyLocator) {
        return signer.withKeyLocator(certName);
      }
      return signer;
    };

    if (CertNaming.isCertName(name)) {
      let signer: NamedSigner;
      try {
        signer = await this.getKey(CertNaming.toKeyName(name), "signer");
      } catch (err: unknown) {
        return useFallback(err as Error);
      }
      return changeKeyLocator(signer, name);
    }

    if (CertNaming.isKeyName(name)) {
      let signer: NamedSigner;
      let certName: Name|undefined;
      try {
        [signer, certName] = await Promise.all([
          this.getKey(name, "signer"),
          this.findSignerCertName(name, ({ keyName }) => name.equals(keyName)),
        ]);
      } catch (err: unknown) {
        return useFallback(err as Error);
      }
      return changeKeyLocator(signer, certName);
    }

    const certName = await this.findSignerCertName(name,
      ({ subjectName }) => prefixMatch || name.equals(subjectName));
    if (certName) {
      const signer = await this.getKey(CertNaming.toKeyName(certName), "signer");
      return changeKeyLocator(signer, certName);
    }

    let keyNames = await this.listKeys(name);
    if (!prefixMatch) {
      keyNames = keyNames.filter((keyName) => {
        const { subjectName } = CertNaming.parseKeyName(keyName);
        return name.equals(subjectName);
      });
    }
    if (keyNames.length > 0) {
      return this.getKey(keyNames[0]!, "signer");
    }
    return useFallback();
  }

  private async findSignerCertName(prefix: Name, filter: (certName: CertNaming.CertNameFields) => boolean): Promise<Name|undefined> {
    const certNames = (await this.listCerts(prefix)).filter((certName) => {
      const parsed = CertNaming.parseCertName(certName);
      return !parsed.issuerId.equals(CertNaming.ISSUER_SELF) && filter(parsed);
    });
    return certNames.length === 0 ? undefined : certNames[0];
  }
}

class KeyChainImpl extends KeyChain {
  constructor(private readonly keys: KeyStore, private readonly certs: CertStore) {
    super();
  }

  public get needJwk() { return !this.keys.canSClone; }

  public async listKeys(prefix: Name = new Name()): Promise<Name[]> {
    return (await this.keys.list()).filter((n) => prefix.isPrefixOf(n));
  }

  public async getKeyPair(name: Name): Promise<KeyChain.KeyPair> {
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
    await this.getKeyPair(CertNaming.toKeyName(cert.name)); // ensure key exists
    await this.certs.insert(cert);
  }

  public async deleteCert(name: Name): Promise<void> {
    await this.certs.erase(name);
  }
}

export namespace KeyChain {
  export type KeyPair<Asym extends boolean = any> = KeyStore.KeyPair<Asym>;

  /**
   * Create a signer from keys and certificates in the KeyChain.
   * @param name subject name, key name, or certificate name.
   * @param fallback invoked when no matching key or certificate is found.
   * @param useKeyNameKeyLocator force KeyLocator to be key name instead of certificate name.
   *
   * @li If name is a certificate name, sign with the corresponding private key,
   *     and use the specified certificate name as KeyLocator.
   * @li If name is a key name, sign with the specified private key.
   *     If a non-self-signed certificate exists for this key, use the certificate name as KeyLocator.
   *     Otherwise, use the key name as KeyLocator.
   * @li If name is neither certificate name nor key name, it is interpreted as a subject name.
   *     A non-self-signed certificate of this subject name is preferred.
   *     If such a certificate does not exist, use any key of this subject name.
   * @li If prefixMatch is true, name can also be interpreted as a prefix of the subject name.
   */
  export interface GetSignerOptions {
    /**
     * If false, name argument must equal subject name, key name, or certificate name.
     * If true, name argument may be a prefix of subject name.
     * Default is false.
     */
    prefixMatch?: boolean;

    /**
     * If a function, it is invoked when no matching key or certificate is found, and should
     * either return a fallback Signer or reject the promise.
     * If a Signer, it is used when no matching key or certificate is found.
     */
    fallback?: Signer | ((name: Name, keyChain: KeyChain, err?: Error) => Promise<Signer>);

    /**
     * If false, KeyLocator is a certificate name when a non-self-signed certificate exists.
     * If true, KeyLocator is the key name.
     * Default is false.
     */
    useKeyNameKeyLocator?: boolean;
  }

  /**
   * Open a persistent keychain.
   * @param locator in Node.js, a filesystem directory; in browser, a database name.
   */
  export function open(locator: string): KeyChain;

  /** Open a keychain from given KeyStore and CertStore. */
  export function open(keys: KeyStore, certs: CertStore): KeyChain;

  export function open(arg1: string|KeyStore, arg2?: CertStore): KeyChain {
    const [pvts, certs] = typeof arg1 === "string" ? openStores(arg1) : [arg1, arg2!];
    return new KeyChainImpl(pvts, certs);
  }

  /** Create an in-memory ephemeral keychain. */
  export function createTemp(): KeyChain {
    return new KeyChainImpl(
      new KeyStore(new MemoryStoreProvider()),
      new CertStore(new MemoryStoreProvider()),
    );
  }
}
