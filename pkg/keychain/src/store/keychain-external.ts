import type { Name } from "@ndn/packet";
import type { Promisable } from "type-fest";

import type { Certificate } from "../certificate";
import type { CryptoAlgorithm } from "../key/mod";
import { KeyStore } from "./key-store";
import { KeyChain, KeyChainSerialized } from "./keychain";

/**
 * KeyChain adapter that copies from an external KeyChain.
 */
export abstract class KeyChainExternal extends KeyChainSerialized {
  private readonly insertKeyLoader: KeyStore.Loader;
  private cached?: KeyChain;

  protected constructor(
      protected readonly algoList: readonly CryptoAlgorithm[],
      public override readonly needJwk = true,
  ) {
    super();
    this.insertKeyLoader = new KeyStore.Loader(needJwk, algoList);
  }

  /** Copy the external KeyChain to `dest`. */
  protected abstract copyTo(dest: KeyChain): Promisable<KeyChain>;

  private async load() {
    return (this.cached ??= await this.copyTo(KeyChain.createTemp(this.algoList)));
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
    try {
      await this.eInsertKey(keyPair);
    } finally {
      delete this.cached;
    }
  }

  /** Insert a key pair in external KeyChain. */
  protected abstract eInsertKey(keyPair: KeyStore.KeyPair): Promisable<void>;

  protected override async sDeleteKey(name: Name): Promise<void> {
    try {
      await this.eDeleteKey(name);
    } finally {
      delete this.cached;
    }
  }

  /** Delete a key pair in external KeyChain. */
  protected abstract eDeleteKey(name: Name): Promisable<void>;

  protected override async sListCerts(prefix: Name): Promise<Name[]> {
    const keyChain = await this.load();
    return keyChain.listCerts(prefix);
  }

  protected override async sGetCert(name: Name): Promise<Certificate> {
    const keyChain = await this.load();
    return keyChain.getCert(name);
  }

  protected override async sInsertCert(cert: Certificate): Promise<void> {
    try {
      await this.eInsertCert(cert);
    } finally {
      delete this.cached;
    }
  }

  /** Insert a certificate in external KeyChain. */
  protected abstract eInsertCert(cert: Certificate): Promisable<void>;

  protected override async sDeleteCert(name: Name): Promise<void> {
    try {
      await this.eDeleteCert(name);
    } finally {
      delete this.cached;
    }
  }

  /** Delete a certificate in external KeyChain. */
  protected abstract eDeleteCert(name: Name): Promisable<void>;
}
