import { Name } from "@ndn/name";

import { Certificate, PrivateKey, PublicKey } from "..";
import { StoredKey } from "../key/internal";
import { openStores } from "../platform";
import { CertStore, KeyStore, SCloneCertStore } from ".";
import { MemoryStoreImpl } from "./store-impl";

export class KeyChain {
  constructor(private readonly keys: KeyStore, private readonly certs: CertStore) {
  }

  /** Return whether KeyStore can structure-clone CryptoKey objects. */
  public get canSCloneKeys() { return this.keys.canSClone; }

  public async listKeys(prefix: Name = new Name()): Promise<Name[]> {
    return (await this.keys.list()).filter((n) => prefix.isPrefixOf(n));
  }

  public async getKeyPair(name: Name): Promise<[PrivateKey, PublicKey]> {
    return await this.keys.get(name);
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
    return await this.certs.get(name);
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
  export function open(locator: string): KeyChain {
    const [pvts, certs] = openStores(locator);
    return new KeyChain(pvts, certs);
  }

  export function createTemp(): KeyChain {
    return new KeyChain(
      new KeyStore(new MemoryStoreImpl()),
      new SCloneCertStore(new MemoryStoreImpl()),
    );
  }
}
