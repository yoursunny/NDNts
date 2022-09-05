import { type UseStore, createStore, del, get, keys, set } from "idb-keyval";

import type { CryptoAlgorithm } from "../key/mod";
import { CertStore } from "./cert-store";
import { KeyStore } from "./key-store";
import type { StoreProvider } from "./store-base";

class IdbStoreProvider<T> implements StoreProvider<T> {
  // Firefox does not support structured clone of ECDSA CryptoKey.
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1545813
  public readonly canSClone = !/rv:.*Gecko\//.test(navigator.userAgent);
  private readonly store: UseStore;

  constructor(dbName: string) {
    this.store = createStore(dbName, "");
  }

  public list(): Promise<string[]> {
    return keys<string>(this.store);
  }

  public async get(key: string): Promise<T> {
    const value = await get<T | undefined>(key, this.store);
    if (value === undefined) {
      throw new Error(`${key} does not exist`);
    }
    return value;
  }

  public insert(key: string, value: T): Promise<void> {
    return set(key, value, this.store);
  }

  public erase(key: string): Promise<void> {
    return del(key, this.store);
  }
}

export function openStores(locator: string, algoList: readonly CryptoAlgorithm[]): [KeyStore, CertStore] {
  return [
    new KeyStore(new IdbStoreProvider(`${locator} e3617e69-4f2c-4221-955a-bea86832595f`), algoList),
    new CertStore(new IdbStoreProvider(`${locator} 9503f5a4-a0a3-4cb0-b764-b0e78afd4ada`)),
  ];
}
