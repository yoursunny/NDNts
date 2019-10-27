import { Name } from "@ndn/name";

import { PrivateKey, PublicKey } from "../../key";
import { KEYGEN, KeyGenerator } from "../../key/internal";
import { KeyName } from "../../name";
import { PrivateKeyStore } from "../internal";
import { JsonStoreBase } from "./internal";

interface Item {
  privateKeyExported: object;
}

export class JsonPrivateKeyStore extends JsonStoreBase<Item> implements PrivateKeyStore {
  public async get(name: Name): Promise<PrivateKey> {
    throw new Error("not implemented");
  }

  public async generate<A extends any[]>(gen: KeyGenerator<A>, name: KeyName,
                                         ...args: A): Promise<[PrivateKey, PublicKey]> {
    const { privateKey, privateKeyExported, publicKey } = await gen[KEYGEN](name, true, ...args);
    await this.insertImpl(name.toName(), {
      privateKeyExported,
    });
    return [privateKey, publicKey];
  }
}
