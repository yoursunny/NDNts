import { Name } from "@ndn/packet";
import { fromHex, toHex } from "@ndn/tlv";
import throat from "throat";

import { StoreImpl } from "./store-impl";

export abstract class StoreBase<T> {
  private throttle = throat(1);

  constructor(protected readonly impl: StoreImpl<T>) {
  }

  public get canSClone() { return this.impl.storableKind === "sclone"; }

  /** List item names. */
  public list(): Promise<Name[]> {
    return this.throttle(() => this.impl.list())
      .then((keys) => keys.map((k) => new Name(fromHex(k))));
  }

  /** Erase item by name. */
  public erase(name: Name): Promise<void> {
    return this.throttle(() => this.impl.erase(toHex(name.value)));
  }

  protected getImpl(name: Name): Promise<T> {
    return this.throttle(() => this.impl.get(toHex(name.value)));
  }

  protected insertImpl(name: Name, value: T): Promise<void> {
    return this.throttle(() => this.impl.insert(toHex(name.value), value));
  }

  protected bufferToStorable(input: Uint8Array|string): Uint8Array|string {
    if (!this.canSClone && ArrayBuffer.isView(input)) {
      return toHex(input);
    }
    return input;
  }

  protected bufferFromStorable(input: Uint8Array|string): Uint8Array {
    if (ArrayBuffer.isView(input)) {
      return input;
    }
    return fromHex(input);
  }
}
