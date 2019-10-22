import { Name, NameLike } from "@ndn/name";

import { Certificate, ValidityPeriod } from "../cert";
import { PrivateKey, PublicKey } from "../key";
import { KeyGenerator } from "../key/internal";
import { KeyName } from "../name";
import { openStores } from "../platform";
import { CertificateStore, PrivateKeyStore } from "./internal";
import { JsonCertificateStore, JsonPrivateKeyStore } from "./json";

interface GenerateResult {
  privateKey: PrivateKey;
  publicKey: PublicKey.SpkiExportable;
  selfSigned: Certificate;
}

export class KeyChain {
  constructor(private readonly pvts: PrivateKeyStore, private readonly certs: CertificateStore) {
  }

  public async listKeys(prefix: Name = new Name()): Promise<Name[]> {
    return (await this.pvts.list()).filter((n) => prefix.isPrefixOf(n));
  }

  public async getKey(name: Name): Promise<PrivateKey> {
    return await this.pvts.get(name);
  }

  public async generateKey<A extends any[]>(
      gen: KeyGenerator<A>, name: NameLike|KeyName,
      validity: ValidityPeriod, ...args: A): Promise<GenerateResult> {
    const [privateKey, publicKey] = await this.pvts.generate(gen, KeyName.create(name), ...args);
    const selfSigned = await Certificate.selfSign({
      // tslint:disable-next-line:object-literal-sort-keys
      validity,
      privateKey,
      publicKey,
    });
    await this.certs.insert(selfSigned);
    return { privateKey, publicKey, selfSigned };
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
}

export namespace KeyChain {
  export function open(locator: string): KeyChain {
    const [pvts, certs] = openStores(locator);
    return new KeyChain(pvts, certs);
  }

  export function createTemp(): KeyChain {
    return new KeyChain(new JsonPrivateKeyStore(), new JsonCertificateStore());
  }
}
