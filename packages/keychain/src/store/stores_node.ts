import Store from "data-store";

import { CertStore } from "./cert-store";
import { KeyStore } from "./key-store";
import type { StoreProvider } from "./store-provider";

class FileStoreProvider<T> implements StoreProvider<T> {
  public readonly canSClone = false;
  private store: Store;

  constructor(path: string) {
    this.store = new Store({ path });
  }

  public list(): Promise<string[]> {
    return Promise.resolve(Object.keys(this.store.data));
  }

  public get(key: string): Promise<T> {
    const value = this.store.data[key] as T|undefined;
    if (typeof value === "undefined") {
      return Promise.reject(new Error(`${key} does not exist`));
    }
    return Promise.resolve(value);
  }

  public insert(key: string, value: T): Promise<void> {
    this.store.data[key] = value;
    this.store.save();
    return Promise.resolve();
  }

  public erase(key: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.store.data[key];
    this.store.save();
    return Promise.resolve();
  }
}

export function openStores(locator: string): [KeyStore, CertStore] {
  return [
    new KeyStore(new FileStoreProvider(`${locator}/fdd08d47-ec4d-4112-a5ce-898338ab0399.json`)),
    new CertStore(new FileStoreProvider(`${locator}/d29e6de4-d5dd-4222-b2e2-d06e4046e7f9.json`)),
  ];
}
