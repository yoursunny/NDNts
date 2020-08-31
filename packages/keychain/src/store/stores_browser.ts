import { del as idbDel, get as idbGet, keys as idbKeys, set as idbSet, Store as idbStore } from "idb-keyval";

import { CertStore } from "./cert-store";
import { KeyStore } from "./key-store";
import type { StoreProvider } from "./store-provider";

class IdbStoreProvider<T> implements StoreProvider<T> {
  // Firefox does not support structured clone of ECDSA CryptoKey.
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1545813
  public readonly canSClone = !/rv:.*Gecko\//.test(navigator.userAgent);
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
    new KeyStore(new IdbStoreProvider(`${locator} e3617e69-4f2c-4221-955a-bea86832595f`)),
    new CertStore(new IdbStoreProvider(`${locator} 9503f5a4-a0a3-4cb0-b764-b0e78afd4ada`)),
  ];
}
