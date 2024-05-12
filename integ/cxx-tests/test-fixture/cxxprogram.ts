import path from "node:path";

import { execa, type Options } from "execa";

const pathOfMakefile = path.resolve(import.meta.dirname, "..");

/**
 * Compile the C++ program in test case directory.
 * @param dir - `import.meta.dirname` of calling test case.
 * @returns Executable full path.
 */
export async function compile(dir: string): Promise<Executable> {
  const rel = path.relative(pathOfMakefile, dir);
  await execa("make", [`${rel}/a.out`], {
    cwd: pathOfMakefile,
    stderr: "inherit",
  });
  return new Executable(path.join(dir, "a.out"));
}

class Executable {
  constructor(public readonly exe: string) {}

  /**
   * Invoke the executable.
   * @param args - Command line arguments.
   * @param opts - Execa options.
   * @returns Execa subprocess.
   */
  public run<Opts extends Options>(args: readonly string[], opts: Opts) {
    return execa(this.exe, args, {
      ...baseOpts,
      ...opts,
      env: { ...baseOpts.env, ...opts?.env },
    });
  }
}

const baseOpts = {
  lines: true,
  stderr: "inherit",
  env: { NDN_NAME_ALT_URI: "0" },
} as const satisfies Options;
