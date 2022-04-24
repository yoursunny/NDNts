import { type Options as ExecaOptions, execa, ExecaChildProcess, execaSync } from "execa";
import * as path from "node:path";

const pathOfMakefile = path.resolve(__dirname, "..");

function compile(dir: string) {
  const rel = path.relative(pathOfMakefile, dir);
  execaSync("make", [`${rel}/a.out`], { cwd: pathOfMakefile, stderr: "inherit" });
}

/**
 * Compile and invoke the C++ program in test case directory.
 * @param dir test case directory that contains C++ files.
 * @param args arguments to the compiled program.
 * @param opts execa options.
 */
export function execute(dir: string, args: readonly string[] = [],
    opts: ExecaOptions = {}): ExecaChildProcess {
  compile(dir);
  return execa("./a.out", args, {
    cwd: dir,
    stderr: "inherit",
    env: { NDN_NAME_ALT_URI: "0" },
    ...opts,
  });
}
