import execa from "execa";

jest.setTimeout(20000);

const COMPILED = new Set<string>();

/** Compile the ndn-cxx program in cwd. */
export async function compile(cwd: string): Promise<void> {
  if (COMPILED.has(cwd)) {
    return;
  }
  await execa.command("g++ -std=c++14 *.cpp $(pkg-config --cflags --libs libndn-cxx)",
                     { cwd, shell: true, stderr: "inherit" });
  COMPILED.add(cwd);
}

/** Invoke the ndn-cxx program in cwd and return line-based output. */
export async function invoke(cwd: string, args?: string[], stdin?: Uint8Array): Promise<string[]> {
  await compile(cwd);
  const { stdout } = await execa("./a.out", args ?? [],
                                 { cwd, input: stdin as Buffer|undefined, stderr: "inherit" });
  return stdout.split("\n");
}
