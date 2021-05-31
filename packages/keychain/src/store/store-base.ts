import { Name } from "@ndn/packet";
import { fromHex, toHex } from "@ndn/tlv";
import throat from "throat";

import type { StoreProvider } from "./store-provider";

export abstract class StoreBase<T> {
  private throttle = throat(1);

  constructor(private readonly provider: StoreProvider<T>) {}

  public get canSClone() { return this.provider.canSClone; }

  /** List item names. */
  public list(): Promise<Name[]> {
    return this.throttle(() => this.provider.list())
      .then((keys) => keys.map((k) => new Name(fromHex(k))));
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
    if (!this.canSClone && ArrayBuffer.isView(input)) {
      return toHex(input);
    }
    return input;
  }
}

export namespace StoreBase {
  export function bufferFromStorable(input: Uint8Array | string): Uint8Array {
    if (ArrayBuffer.isView(input)) {
      return input;
    }
    return fromHex(input);
  }
}
