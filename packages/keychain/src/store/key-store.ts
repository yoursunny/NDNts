import { Name } from "@ndn/packet";

import { loadFromStored as loadFromStored_ } from "../key/load";
import { StoredKey as StoredKey_ } from "../key/save";
import { PrivateKey, PublicKey } from "../mod";
import { StoreBase } from "./store-base";

/** Storage of private keys. */
export class KeyStore extends StoreBase<KeyStore.StoredKey> {
  public async get(name: Name): Promise<[PrivateKey, PublicKey]> {
    const stored = await this.getImpl(name);
    const { privateKey, publicKey } = await KeyStore.loadFromStored(name, stored);
    return [privateKey, publicKey];
  }

  public async insert(name: Name, stored: KeyStore.StoredKey): Promise<void> {
    await this.insertImpl(name, stored);
  }
}

export namespace KeyStore {
  export type StoredKey = StoredKey_;

  export const loadFromStored = loadFromStored_;
}
