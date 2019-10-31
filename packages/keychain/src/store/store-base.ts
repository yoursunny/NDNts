import { Name } from "@ndn/name";
import throat from "throat";

import { Certificate } from "..";
import { StoreImpl } from "./store-impl";

export abstract class StoreBase<T> {
  private throttle = throat(1);

  constructor(protected readonly impl: StoreImpl<T>) {
  }

  protected get isJsonFormat() { return this.impl.storableKind === "json"; }

  /** List item names. */
  public list(): Promise<Name[]> {
    return this.throttle(() => this.impl.list())
    .then((keys) => keys.map((uri) => new Name(uri)));
  }

  /** Erase item by name. */
  public erase(name: Name): Promise<void> {
    return this.throttle(() => this.impl.erase(name.toString()));
  }

  protected getImpl(name: Name): Promise<T> {
    return this.throttle(() => this.impl.get(name.toString()));
  }

  protected insertImpl(name: Name, value: T): Promise<void> {
    return this.throttle(() => this.impl.insert(name.toString(), value));
  }
}

export interface CertStore extends StoreBase<unknown> {
  get(name: Name): Promise<Certificate>;
  insert(cert: Certificate): Promise<void>;
}
