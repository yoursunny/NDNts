import { constants as FS, promises as fs } from "fs";
import write from "write";

import { JsonCertificateStore, JsonPrivateKeyStore } from "../../store/json";

class FileStore {
  constructor(private readonly filename: string) {
  }

  public async load(): Promise<object> {
    try { await fs.access(this.filename, FS.R_OK); } catch { return {}; }
    const json = await fs.readFile(this.filename, "utf-8");
    return JSON.parse(json);
  }

  public async store(obj: object): Promise<void> {
    await write(this.filename, JSON.stringify(obj), { overwrite: true });
  }
}

export class FilePrivateKeyStore extends JsonPrivateKeyStore {
  constructor(filename: string) {
    super(new FileStore(filename));
  }
}

export class FileCertificateStore extends JsonCertificateStore {
  constructor(filename: string) {
    super(new FileStore(filename));
  }
}
