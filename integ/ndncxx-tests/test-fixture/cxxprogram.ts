import execa from "execa";

jest.setTimeout(20000);

const COMPILED = new Set<string>();

/** Compile the ndn-cxx program in cwd. */
function compile(cwd: string) {
  if (COMPILED.has(cwd)) {
    return;
  }
  execa.commandSync("g++ -std=c++14 *.cpp $(pkg-config --cflags --libs libndn-cxx)",
                    { cwd, shell: true, stderr: "inherit" });
  COMPILED.add(cwd);
}

/** Invoke the ndn-cxx program in cwd and return line-based output. */
export function execute(cwd: string, args: string[] = [],
                        opts: execa.Options = {}): execa.ExecaChildProcess {
  compile(cwd);
  return execa("./a.out", args, { cwd, stderr: "inherit", ...opts });
}
