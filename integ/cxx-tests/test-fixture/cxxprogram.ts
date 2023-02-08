import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { type ExecaChildProcess, type Options as ExecaOptions, execa, execaSync } from "execa";

const pathOfMakefile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function compile(dir: string) {
  const rel = path.relative(pathOfMakefile, dir);
  execaSync("make", [`${rel}/a.out`], { cwd: pathOfMakefile, stderr: "inherit" });
}

/**
 * Compile and invoke the C++ program in test case directory.
 * @param importMetaUrl import.meta.url of calling test case.
 * @param args arguments to the compiled program.
 * @param opts execa options.
 */
export function execute(importMetaUrl: string, args: readonly string[] = [],
    opts: ExecaOptions = {}): ExecaChildProcess {
  const dir = path.dirname(fileURLToPath(importMetaUrl));
  compile(dir);
  return execa("./a.out", args, {
    cwd: dir,
    stderr: "inherit",
    env: { NDN_NAME_ALT_URI: "0" },
    ...opts,
  });
}
