import Store from "data-store";

import { JsonCertStore } from "../json-cert-store";
import { KeyStore } from "../key-store";
import type { CertStore } from "../store-base";
import { StoreImpl } from "../store-impl";

export class FileStoreImpl<T> implements StoreImpl<T> {
  public readonly storableKind = "json";
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
    new KeyStore(new FileStoreImpl(`${locator}/831e5c8f-9d63-40f3-8359-0f55254eeb80.json`)),
    new JsonCertStore(new FileStoreImpl(`${locator}/c339669f-8d4b-4cb3-a8c2-09af61edd787.json`)),
  ];
}
