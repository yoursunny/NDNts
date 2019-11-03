import { Name } from "@ndn/name";

import { PrivateKey } from "..";
import { loadPvtExport } from "../key/import";
import { PvtExport } from "../key/internal";
import { StoreBase } from "./store-base";

interface Item {
  pvtExport: PvtExport;
}

export class PrivateKeyStore extends StoreBase<Item> {
  public async get(name: Name): Promise<PrivateKey> {
    const { pvtExport } = await this.getImpl(name);
    return await loadPvtExport(name, pvtExport);
  }

  public async insert(name: Name, pvtExport: PvtExport): Promise<void> {
    await this.insertImpl(name, { pvtExport });
  }
}
