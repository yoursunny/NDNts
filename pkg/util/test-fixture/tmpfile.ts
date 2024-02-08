import path from "node:path";

import { dirSync as tmpDir, fileSync as tmpFile } from "tmp";
import { sync as write } from "write";

const removeCallbacks: Array<() => void> = [];

export function writeTmpFile(content: string | Uint8Array): string {
  const { name, removeCallback } = tmpFile();
  removeCallbacks.push(removeCallback);
  write(name, content);
  return name;
}

export function deleteTmpFiles() {
  for (const f of removeCallbacks) {
    f();
  }
}

export function makeTmpDir(): TmpDir {
  const { name, removeCallback } = tmpDir({ unsafeCleanup: true });
  return {
    name,
    join: (...segments) => path.join(name, ...segments),
    [Symbol.dispose]: removeCallback,
  };
}

export interface TmpDir extends Disposable {
  name: string;
  join: (...segments: string[]) => string;
}
