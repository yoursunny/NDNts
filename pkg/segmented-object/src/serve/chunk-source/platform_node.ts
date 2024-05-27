import fs from "node:fs/promises";

import { promises as zenfs } from "@zenfs/core";

import type { FileChunkSource } from "./file";

export function fsOpen(path: string, opts: FileChunkSource.Options): Promise<fs.FileHandle> {
  if (opts.zenfs) {
    return zenfs.open(path, "r");
  }
  return fs.open(path, "r");
}
