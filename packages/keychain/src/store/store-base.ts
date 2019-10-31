import { Name } from "@ndn/name";

import { Certificate } from "..";
import { StoreImpl } from "./store-impl";

export abstract class StoreBase<T> {
  constructor(protected readonly impl: StoreImpl<T>) {
  }

  protected get isJsonFormat() { return this.impl.storableKind === "json"; }

  /** List item names. */
  public async list(): Promise<Name[]> {
    const keys = await this.impl.list();
    return keys.map((uri) => new Name(uri));
  }

  /** Erase item by name. */
  public async erase(name: Name): Promise<void> {
    await this.impl.erase(name.toString());
  }

  protected async getImpl(name: Name): Promise<T> {
    return await this.impl.get(name.toString());
  }

  protected async insertImpl(name: Name, value: T): Promise<void> {
    await this.impl.insert(name.toString(), value);
  }
}

export interface CertStore extends StoreBase<unknown> {
  get(name: Name): Promise<Certificate>;
  insert(cert: Certificate): Promise<void>;
}
