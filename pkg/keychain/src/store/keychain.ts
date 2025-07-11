import { Name, type Signer } from "@ndn/packet";
import type { Promisable } from "type-fest";
import { Mutex } from "wait-your-turn";

import { CryptoAlgorithmListSlim } from "../algolist/mod";
import type { Certificate } from "../certificate";
import type { CryptoAlgorithm, NamedSigner } from "../key/mod";
import * as CertNaming from "../naming";
import { CertStore } from "./cert-store";
import { KeyStore } from "./key-store";
import { MemoryStoreProvider } from "./store-base";
import { openStores } from "./stores_node";

/** Storage of own private keys and certificates. */
export abstract class KeyChain {
  /** Return whether `.insertKey()` method expects JsonWebKey instead of CryptoKey. */
  public abstract readonly needJwk: boolean;

  /** List keys, filtered by name prefix. */
  public abstract listKeys(prefix?: Name): Promise<Name[]>;

  /** Retrieve key pair by key name. */
  public abstract getKeyPair(name: Name): Promise<KeyChain.KeyPair>;

  /**
   * Retrieve key by key name.
   * @param typ - "signer", "verifier", etc.
   */
  public async getKey<K extends keyof KeyChain.KeyPair>(name: Name, typ: K): Promise<KeyChain.KeyPair[K]> {
    const keyPair = await this.getKeyPair(name);
    return keyPair[typ];
  }

  /** Insert key pair. */
  public abstract insertKey(name: Name, stored: KeyStore.StoredKey): Promise<void>;

  /** Delete key pair and associated certificates. */
  public abstract deleteKey(name: Name): Promise<void>;

  /** List certificates, filtered by name prefix. */
  public abstract listCerts(prefix?: Name): Promise<Name[]>;

  /** Retrieve certificate by cert name. */
  public abstract getCert(name: Name): Promise<Certificate>;

  /**
   * Insert certificate.
   *
   * @remarks
   * Corresponding key must exist.
   */
  public abstract insertCert(cert: Certificate): Promise<void>;

  /** Delete certificate. */
  public abstract deleteCert(name: Name): Promise<void>;

  /**
   * Create a signer from keys and certificates in the KeyChain.
   * @param name - Subject name, key name, or certificate name.
   *
   * @remarks
   * If `name` is a certificate name, sign with the corresponding private key, and use the
   * specified certificate name as KeyLocator.
   *
   * If `name` is a key name, sign with the specified private key. If a non-self-signed certificate
   * exists for this key, use the certificate name as KeyLocator. Otherwise, use the key name as
   * KeyLocator.
   *
   * If `name` is neither a certificate name nor a key name, it is interpreted as a subject name.
   * A non-self-signed certificate of this subject name is preferred. If no such certificate
   * exists, use any key of this subject name.
   *
   * If `prefixMatch` is true, `name` can also be interpreted as a prefix of the subject name.
   */
  public async getSigner(
      name: Name,
      { prefixMatch = false, fallback, useKeyNameKeyLocator = false }: KeyChain.GetSignerOptions = {},
  ): Promise<Signer> {
    const useFallback = (err?: Error) => {
      if (fallback === undefined) {
        throw new Error(`signer ${name} not found ${err}`, { cause: err });
      }
      if (typeof fallback === "function") {
        return fallback(name, this, err);
      }
      return fallback;
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
      let certName: Name | undefined;
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

    const certName = await this.findSignerCertName(
      name,
      ({ subjectName }) => prefixMatch || name.equals(subjectName),
    );
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

  private async findSignerCertName(prefix: Name, filter: (certName: CertNaming.CertNameFields) => boolean): Promise<Name | undefined> {
    const certName_ = (await this.listCerts(prefix)).find((certName) => {
      const parsed = CertNaming.parseCertName(certName);
      return !parsed.issuerId.equals(CertNaming.ISSUER_SELF) && filter(parsed);
    });
    return certName_;
  }
}

export namespace KeyChain {
  export type KeyPair<Asym extends boolean = any> = KeyStore.KeyPair<Asym>;

  /** {@link KeyChain.getSigner} options. */
  export interface GetSignerOptions {
    /**
     * Whether to allow prefix match between name argument and subject name.
     * @defaultValue false
     *
     * @remarks
     * If `false`, `name` argument must equal subject name, key name, or certificate name.
     * If `true`, `name` argument may be a prefix of subject name.
     */
    prefixMatch?: boolean;

    /**
     * Fallback when no matching or certificate is found.
     *
     * @remarks
     * If this is a function, it is invoked when no matching key or certificate is found. The
     * function should either return a fallback Signer or reject the promise.
     *
     * If this is a Signer, it is used when no matching key or certificate is found.
     */
    fallback?: Signer | GetSignerFallback;

    /**
     * Whether to prefer key name in KeyLocator.
     * @defaultValue false
     *
     * @remarks
     * If `false`, KeyLocator is a certificate name when a non-self-signed certificate exists.
     * If `true`, KeyLocator is the key name.
     */
    useKeyNameKeyLocator?: boolean;
  }

  export type GetSignerFallback = (name: Name, keyChain: KeyChain, err?: Error) => Promise<Signer>;

  /**
   * Open a persistent KeyChain.
   * @param locator - Filesystem directory in Node.js; database name in browser.
   * @param algoList - List of recognized algorithms.
   * Default is {@link CryptoAlgorithmListSlim}. Use {@link CryptoAlgorithmListFull} for all
   * algorithms, at the cost of larger bundle size.
   */
  export function open(locator: string, algoList?: readonly CryptoAlgorithm[]): KeyChain;

  /** Open a KeyChain from given KeyStore and CertStore. */
  export function open(keys: KeyStore, certs: CertStore): KeyChain;

  export function open(arg1: any, arg2: any = CryptoAlgorithmListSlim): KeyChain {
    if (typeof arg1 === "string") {
      return new KeyChainImpl(...openStores(arg1, arg2));
    }
    return new KeyChainImpl(arg1, arg2);
  }

  /**
   * Create an in-memory ephemeral KeyChain.
   * @param algoList - List of recognized algorithms.
   * Default is {@link CryptoAlgorithmListSlim}. Use {@link CryptoAlgorithmListFull} for all
   * algorithms, at the cost of larger bundle size.
   */
  export function createTemp(algoList = CryptoAlgorithmListSlim): KeyChain {
    return new KeyChainImpl(
      new KeyStore(new MemoryStoreProvider(), algoList),
      new CertStore(new MemoryStoreProvider()),
    );
  }
}

/**
 * KeyChain adapter that serializes function calls.
 *
 * @remarks
 * Only one `s*` function would be invoked at a time. Do not invoke a non-`s*` function from
 * within an `s*` function, otherwise it would cause a deadlock.
 */
export abstract class KeyChainSerialized extends KeyChain {
  protected readonly mutex = new Mutex();

  public override listKeys(prefix: Name = new Name()): Promise<Name[]> {
    return this.mutex.use(async () => this.sListKeys(prefix));
  }

  protected abstract sListKeys(prefix: Name): Promisable<Name[]>;

  public override getKeyPair(name: Name): Promise<KeyChain.KeyPair> {
    return this.mutex.use(async () => this.sGetKeyPair(name));
  }

  protected abstract sGetKeyPair(name: Name): Promisable<KeyChain.KeyPair>;

  public override insertKey(name: Name, stored: KeyStore.StoredKey): Promise<void> {
    return this.mutex.use(async () => this.sInsertKey(name, stored));
  }

  protected abstract sInsertKey(name: Name, stored: KeyStore.StoredKey): Promisable<void>;

  public override deleteKey(name: Name): Promise<void> {
    return this.mutex.use(async () => this.sDeleteKey(name));
  }

  protected abstract sDeleteKey(name: Name): Promisable<void>;

  public override listCerts(prefix: Name = new Name()): Promise<Name[]> {
    return this.mutex.use(async () => this.sListCerts(prefix));
  }

  protected abstract sListCerts(prefix: Name): Promisable<Name[]>;

  public override getCert(name: Name): Promise<Certificate> {
    return this.mutex.use(async () => this.sGetCert(name));
  }

  protected abstract sGetCert(name: Name): Promisable<Certificate>;

  public override insertCert(cert: Certificate): Promise<void> {
    return this.mutex.use(async () => this.sInsertCert(cert));
  }

  protected abstract sInsertCert(cert: Certificate): Promisable<void>;

  public override deleteCert(name: Name): Promise<void> {
    return this.mutex.use(async () => this.sDeleteCert(name));
  }

  protected abstract sDeleteCert(name: Name): Promisable<void>;
}

class KeyChainImpl extends KeyChainSerialized {
  constructor(private readonly keys: KeyStore, private readonly certs: CertStore) {
    super();
  }

  public override get needJwk() { return !this.keys.canSClone; }

  protected override async sListKeys(prefix: Name): Promise<Name[]> {
    return (await this.keys.list()).filter((n) => prefix.isPrefixOf(n));
  }

  protected override async sGetKeyPair(name: Name): Promise<KeyChain.KeyPair> {
    return this.keys.get(name);
  }

  protected override async sInsertKey(name: Name, stored: KeyStore.StoredKey): Promise<void> {
    await this.keys.insert(name, stored);
  }

  protected override async sDeleteKey(name: Name): Promise<void> {
    for (const certName of await this.sListCerts(name)) {
      await this.certs.erase(certName);
    }
    await this.keys.erase(name);
  }

  protected override async sListCerts(prefix: Name): Promise<Name[]> {
    return (await this.certs.list()).filter((n) => prefix.isPrefixOf(n));
  }

  protected override async sGetCert(name: Name): Promise<Certificate> {
    return this.certs.get(name);
  }

  protected override async sInsertCert(cert: Certificate): Promise<void> {
    await this.keys.get(CertNaming.toKeyName(cert.name)); // ensure key exists
    await this.certs.insert(cert);
  }

  protected override async sDeleteCert(name: Name): Promise<void> {
    await this.certs.erase(name);
  }
}
