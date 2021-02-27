import { fileSync as tmpFile } from "tmp";
import { sync as write } from "write";

const removeCallbacks = [] as Array<() => void>;

export function writeTmpFile(content: string|Uint8Array): string {
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
