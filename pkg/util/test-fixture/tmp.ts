import path from "node:path";

import { dirSync as tmpDir, tmpNameSync as tmpName } from "tmp";
import { sync as write } from "write";

/** Create a temporary directory. */
export function makeTmpDir(): TmpDir {
  const { name, removeCallback } = tmpDir({ prefix: "tmp-NDNts-", unsafeCleanup: true });
  const filename = () => tmpName({ dir: name });
  return {
    name,
    join: (...segments) => path.join(name, ...segments),
    filename,
    createFile: (content) => {
      const fn = filename();
      write(fn, content);
      return fn;
    },
    [Symbol.dispose]: removeCallback,
  };
}

/**
 * Temporary directory.
 *
 * @remarks
 * Disposing this object deletes the directory and its content.
 */
export interface TmpDir extends Disposable {
  /** Directory path. */
  readonly name: string;

  /** Join with additional path segment(s). */
  join: (...segments: string[]) => string;

  /**
   * Generate random filename within the directory.
   * @returns Full filename.
   */
  filename: () => string;

  /**
   * Write content to a file within the directory.
   * @returns Full filename.
   */
  createFile: (content: string | Uint8Array) => string;
}
