/** Underlying storage provider. */
export interface StoreProvider<T> {
  /**
   * Indicate whether the storage provider supports the structured clone algorithm.
   * If false, values must be serialized as JSON.
   */
  readonly canSClone: boolean;

  list: () => Promise<string[]>;
  get: (key: string) => Promise<T>;
  insert: (key: string, value: T) => Promise<void>;
  erase: (key: string) => Promise<void>;
}

/** Memory based storage provider. */
export class MemoryStoreProvider<T> implements StoreProvider<T> {
  public readonly canSClone = true;

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
