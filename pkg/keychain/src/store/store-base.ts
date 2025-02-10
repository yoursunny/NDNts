import { Name } from "@ndn/packet";
import { fromHex, toHex } from "@ndn/util";
import type { Promisable } from "type-fest";

/**
 * KV store provider where each key is a string.
 *
 * @remarks
 * Function calls are serialized. This does not have to be thread safe.
 */
export interface StoreProvider<T> {
  /**
   * Indicate whether the store provider supports the structured clone algorithm.
   * If false, values must be JSON serializable.
   */
  readonly canSClone: boolean;

  /** List keys. */
  list: () => Promisable<string[]>;

  /** Retrieve value by key. */
  get: (key: string) => Promisable<T>;

  /** Insert key and value. */
  insert: (key: string, value: T) => Promisable<void>;

  /** Erase key. */
  erase: (key: string) => Promisable<void>;
}

/** Memory based KV store provider. */
export class MemoryStoreProvider<T> implements StoreProvider<T> {
  public readonly canSClone: boolean = true;
  public record: Record<string, T> = {};

  public list(): string[] {
    return Object.keys(this.record);
  }

  public get(key: string): T {
    const value = this.record[key];
    if (value === undefined) {
      throw new Error(`key ${key} is missing`);
    }
    return value;
  }

  public insert(key: string, value: T): void {
    this.record[key] = value;
  }

  public erase(key: string): void {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.record[key];
  }
}

/**
 * KV store where each key is a Name.
 *
 * @remarks
 * Function calls are serialized. This does not have to be thread safe.
 */
export abstract class StoreBase<T> {
  constructor(private readonly provider: StoreProvider<T>) {}

  public get canSClone() { return this.provider.canSClone; }

  /** List item names. */
  public async list(): Promise<Name[]> {
    const keys = await this.provider.list();
    return keys.map((k) => new Name(fromHex(k)));
  }

  /** Erase item by name. */
  public async erase(name: Name): Promise<void> {
    await this.provider.erase(name.valueHex);
  }

  protected async getValue(name: Name): Promise<T> {
    return this.provider.get(name.valueHex);
  }

  protected async insertValue(name: Name, value: T): Promise<void> {
    await this.provider.insert(name.valueHex, value);
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
    return input instanceof Uint8Array ? input : fromHex(input);
  }
}
