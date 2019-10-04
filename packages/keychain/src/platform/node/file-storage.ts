import { Name } from "@ndn/name";
import { promises as fs } from "fs";
import * as path from "path";
import { promise as readdirp, ReaddirpOptions } from "readdirp";
import write from "write";

export abstract class FileStorage {
  private readonly dir: string;

  protected constructor(directory: string, private readonly ext: string) {
    this.dir = path.resolve(directory);
  }

  public async list(): Promise<Name[]> {
    const files = await readdirp(this.dir, {
      fileFilter: `*.${this.ext}`,
    } as ReaddirpOptions);
    return files.map((entry) => {
      const comps = entry.path.split(path.sep)
        .map((pathSeg) => Buffer.from(pathSeg, "hex").toString("utf8"));
      return new Name(comps);
    });
  }

  public async erase(name: Name): Promise<void> {
    const filename = this.getFilename(name);
    await fs.unlink(filename);
  }

  protected async getImpl(name: Name): Promise<Uint8Array> {
    const filename = this.getFilename(name);
    return await fs.readFile(filename);
  }

  protected async insertImpl(name: Name, payload: Uint8Array): Promise<void> {
    const filename = this.getFilename(name);
    await write(filename, payload, { overwrite: true });
  }

  protected getFilename(name: Name): string {
    const pathSegs = name.comps
      .map((comp) => Buffer.from(comp.toString(), "utf8").toString("hex"));
    return path.resolve(this.dir, ...pathSegs) + `.${this.ext}`;
  }
}
