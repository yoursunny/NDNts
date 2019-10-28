import { Name } from "@ndn/name";

import { PrivateKey, PublicKey } from "../../key";
import { importPrivateKey } from "../../key/import";
import { KeyGenerator } from "../../key/internal";
import { KeyName } from "../../name";
import { PrivateKeyStore } from "../internal";
import { JsonStoreBase } from "./internal";

interface Item {
  privateKeyExported: object;
}

export class JsonPrivateKeyStore extends JsonStoreBase<Item> implements PrivateKeyStore {
  public async get(name: Name): Promise<PrivateKey> {
    const { privateKeyExported } = await this.getImpl(name);
    return await importPrivateKey(name, true, privateKeyExported);
  }

  public async generate<A extends any[]>(gen: KeyGenerator<A>, name: KeyName,
                                         ...args: A): Promise<[PrivateKey, PublicKey]> {
    const { privateKey, privateKeyExported, publicKey } = await gen.generate(name, true, ...args);
    await this.insertImpl(name.toName(), {
      privateKeyExported,
    });
    return [privateKey, publicKey];
  }
}
