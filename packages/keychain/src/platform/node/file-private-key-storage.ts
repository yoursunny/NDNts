import { Name } from "@ndn/name";

import { PrivateKey } from "../../key";
import { PrivateKeyStorage } from "../storage";
import { FileStorage } from "./file-storage";

export class FilePrivateKeyStorage extends FileStorage implements PrivateKeyStorage {
  constructor(dir: string) {
    super(dir, "cert");
  }

  public async get(name: Name): Promise<PrivateKey> {
    throw new Error("not implemented");
  }

  public async insert(key: PrivateKey): Promise<void> {
    throw new Error("not implemented");
  }
}
