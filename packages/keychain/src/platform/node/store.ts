import Store from "data-store";

import { StoreImpl } from "../../store/store-impl";

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
    delete this.store.data[key];
    this.store.save();
    return Promise.resolve();
  }
}
