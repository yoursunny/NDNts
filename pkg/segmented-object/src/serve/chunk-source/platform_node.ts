import fs from "node:fs/promises";

import type { FileChunkSource } from "./file";

export function fsOpen(path: string, opts: FileChunkSource.Options): Promise<fs.FileHandle> {
  void opts;
  return fs.open(path, "r");
}
