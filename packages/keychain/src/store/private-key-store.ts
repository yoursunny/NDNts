import { Name } from "@ndn/name";

import { KeyName, PrivateKey, PublicKey } from "..";
import { importPrivateKey } from "../key/import";
import { KeyGenerator } from "../key/internal";
import { StoreBase } from "./store-base";

interface Item {
  privateKeyExported: object;
}

export class PrivateKeyStore extends StoreBase<Item> {
  public async get(name: Name): Promise<PrivateKey> {
    const { privateKeyExported } = await this.getImpl(name);
    return await importPrivateKey(name, this.isJsonFormat, privateKeyExported);
  }

  public async generate<A extends any[]>(gen: KeyGenerator<A>, name: KeyName,
                                         ...args: A): Promise<[PrivateKey, PublicKey]> {
    const { privateKey, privateKeyExported, publicKey } =
      await gen.generate(name, this.isJsonFormat, ...args);
    await this.insertImpl(name.toName(), {
      privateKeyExported,
    });
    return [privateKey, publicKey];
  }
}
