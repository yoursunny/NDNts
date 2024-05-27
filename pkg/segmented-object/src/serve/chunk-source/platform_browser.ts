import { promises as zenfs } from "@zenfs/core";

export function fsOpen(path: string): Promise<zenfs.FileHandle> {
  return zenfs.open(path, "r");
}
