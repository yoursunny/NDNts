import { Name } from "@ndn/packet";

import { PrivateKey, PublicKey } from "..";
import { loadFromStored } from "../key/load";
import { StoredKey } from "../key/save";
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
