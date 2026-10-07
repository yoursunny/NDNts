import fs from "node:fs/promises";

import type { FileChunkSource } from "./file";

export function fsOpen(path: string, _opts: FileChunkSource.Options): Promise<fs.FileHandle> {
  return fs.open(path, "r");
}
