import { del as idbDel, get as idbGet, keys as idbKeys, set as idbSet, Store as idbStore } from "idb-keyval";

import { CertStore, KeyStore, SCloneCertStore } from "../mod";
import { StoreImpl } from "../store-impl";

export class IdbStoreImpl<T> implements StoreImpl<T> {
  public readonly storableKind = "sclone";
  private readonly store: idbStore;

  constructor(dbName: string) {
    this.store = new idbStore(dbName, "");
  }

  public list(): Promise<string[]> {
    return idbKeys(this.store) as Promise<string[]>;
  }

  public async get(key: string): Promise<T> {
    const value = await idbGet<T|undefined>(key, this.store);
    if (typeof value === "undefined") {
      return Promise.reject(new Error(`${key} does not exist`));
    }
    return Promise.resolve(value);
  }

  public insert(key: string, value: T): Promise<void> {
    return idbSet(key, value, this.store);
  }

  public erase(key: string): Promise<void> {
    return idbDel(key, this.store);
  }
}

export function openStores(locator: string): [KeyStore, CertStore] {
  return [
    new KeyStore(new IdbStoreImpl(`${locator} 2dc9febb-a01a-4543-8180-f03d24bea8f6`)),
    new SCloneCertStore(new IdbStoreImpl(`${locator} ecf40b97-07cb-4b4d-92ed-adcbaa0a9855`)),
  ];
}
