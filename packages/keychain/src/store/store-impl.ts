/**
 * Indicate what item can be stored.
 * "json": types that can be serialized as JSON.
 * "sclone": types compatible with the structure clone algorithm.
 */
export type StorableKind = "json"|"sclone";

/**
 * Underlying storage provider.
 */
export interface StoreImpl<T> {
  readonly storableKind: StorableKind;
  list: () => Promise<string[]>;
  get: (key: string) => Promise<T>;
  insert: (key: string, value: T) => Promise<void>;
  erase: (key: string) => Promise<void>;
}

export class MemoryStoreImpl<T> implements StoreImpl<T> {
  public readonly storableKind = "sclone";

  private map = new Map<string, T>();

  public list(): Promise<string[]> {
    return Promise.resolve(Array.from(this.map.keys()));
  }

  public get(key: string): Promise<T> {
    const value = this.map.get(key);
    if (typeof value === "undefined") {
      return Promise.reject(new Error(`key ${key} is missing`));
    }
    return Promise.resolve(value);
  }

  public insert(key: string, value: T): Promise<void> {
    this.map.set(key, value);
    return Promise.resolve();
  }

  public erase(key: string): Promise<void> {
    this.map.delete(key);
    return Promise.resolve();
  }
}
