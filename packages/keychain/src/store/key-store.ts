import { Name } from "@ndn/name";

import { PrivateKey } from "..";
import { PublicKey } from "../key";
import { loadFromStored } from "../key/import";
import { StoredKey } from "../key/internal";
import { StoreBase } from "./store-base";

export class KeyStore extends StoreBase<StoredKey> {
  public async get(name: Name): Promise<[PrivateKey, PublicKey]> {
    const stored = await this.getImpl(name);
    return await loadFromStored(name, stored);
  }

  public async insert(name: Name, stored: StoredKey): Promise<void> {
    await this.insertImpl(name, stored);
  }
}
