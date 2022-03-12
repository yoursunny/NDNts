import { Name } from "@ndn/packet";
import { fromHex, toHex } from "@ndn/util";
import throat from "throat";

/**
 * KV store provider where each key is a string.
 * Methods are called one at a time.
 */
export interface StoreProvider<T> {
  /**
   * Indicate whether the store provider supports the structured clone algorithm.
   * If false, values must be serialized as JSON.
   */
  readonly canSClone: boolean;

  list: () => Promise<string[]>;
  get: (key: string) => Promise<T>;
  insert: (key: string, value: T) => Promise<void>;
  erase: (key: string) => Promise<void>;
}

/** Memory based KV store provider. */
export class MemoryStoreProvider<T> implements StoreProvider<T> {
  public readonly canSClone: boolean = true;
  protected record: Record<string, T> = {};

  public async list(): Promise<string[]> {
    return Object.keys(this.record);
  }

  public async get(key: string): Promise<T> {
    const value = this.record[key];
    if (value === undefined) {
      throw new Error(`key ${key} is missing`);
    }
    return value;
  }

  public async insert(key: string, value: T): Promise<void> {
    this.record[key] = value;
  }

  public async erase(key: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.record[key];
  }
}

/** KV store where each key is a Name. */
export abstract class StoreBase<T> {
  private throttle = throat(1);

  constructor(private readonly provider: StoreProvider<T>) {}

  public get canSClone() { return this.provider.canSClone; }

  /** List item names. */
  public async list(): Promise<Name[]> {
    const keys = await this.throttle(() => this.provider.list());
    return keys.map((k) => new Name(fromHex(k)));
  }

  /** Erase item by name. */
  public erase(name: Name): Promise<void> {
    return this.throttle(() => this.provider.erase(toHex(name.value)));
  }

  protected getValue(name: Name): Promise<T> {
    return this.throttle(() => this.provider.get(toHex(name.value)));
  }

  protected insertValue(name: Name, value: T): Promise<void> {
    return this.throttle(() => this.provider.insert(toHex(name.value), value));
  }

  protected bufferToStorable(input: Uint8Array | string): Uint8Array | string {
    if (!this.canSClone && input instanceof Uint8Array) {
      return toHex(input);
    }
    return input;
  }
}

export namespace StoreBase {
  export function bufferFromStorable(input: Uint8Array | string): Uint8Array {
    if (input instanceof Uint8Array) {
      return input;
    }
    return fromHex(input);
  }
}
