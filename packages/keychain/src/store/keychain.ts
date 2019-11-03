import { Name } from "@ndn/name";

import { Certificate, ValidityPeriod } from "../cert";
import { PrivateKey, PublicKey } from "../key";
import { PvtExport } from "../key/internal";
import { openStores } from "../platform";
import { PrivateKeyStore } from "./private-key-store";
import { SCloneCertStore } from "./sclone-cert-store";
import { CertStore } from "./store-base";
import { MemoryStoreImpl } from "./store-impl";

export class KeyChain {
  constructor(private readonly pvts: PrivateKeyStore, private readonly certs: CertStore) {
  }

  /** Return whether PrivateKeyStore can structure-clone CryptoKey objects. */
  public get canSClonePvt() { return this.pvts.canSClone; }

  public async listKeys(prefix: Name = new Name()): Promise<Name[]> {
    return (await this.pvts.list()).filter((n) => prefix.isPrefixOf(n));
  }

  public async getKey(name: Name): Promise<PrivateKey> {
    return await this.pvts.get(name);
  }

  public async insertKey(privateKey: PrivateKey, pvtExport: PvtExport, publicKey: PublicKey): Promise<void> {
    const selfSigned = await Certificate.selfSign({
      validity: ValidityPeriod.MAX,
      privateKey,
      publicKey,
    });
    await Promise.all([
      this.pvts.insert(privateKey.name, pvtExport),
      this.certs.insert(selfSigned),
    ]);
  }

  public async deleteKey(name: Name): Promise<void> {
    const certs = await this.listCerts(name);
    await Promise.all(certs.map((cert) => this.certs.erase(cert)));
    await this.pvts.erase(name);
  }

  public async listCerts(prefix: Name = new Name()): Promise<Name[]> {
    return (await this.certs.list()).filter((n) => prefix.isPrefixOf(n));
  }

  public async getCert(name: Name): Promise<Certificate> {
    return await this.certs.get(name);
  }

  public async findCert(keyName: Name): Promise<Certificate> {
    const list = await this.listCerts(keyName);
    if (list.length === 0) {
      throw new Error(`no Certificate for key ${keyName}`)
    }
    return await this.getCert(list[0]);
  }
}

export namespace KeyChain {
  export function open(locator: string): KeyChain {
    const [pvts, certs] = openStores(locator);
    return new KeyChain(pvts, certs);
  }

  export function createTemp(): KeyChain {
    return new KeyChain(
      new PrivateKeyStore(new MemoryStoreImpl()),
      new SCloneCertStore(new MemoryStoreImpl()),
    );
  }
}
