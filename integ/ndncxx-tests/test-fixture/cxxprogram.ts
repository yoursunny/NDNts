import { execute, ExecuteOptions } from "spawn2";

const COMPILED = new Set<string>();

/** Compile the ndn-cxx program in cwd. */
export async function compile(cwd: string): Promise<void> {
  if (COMPILED.has(cwd)) {
    return;
  }
  await execute("g++ -std=c++14 *.cpp $(pkg-config --cflags --libs libndn-cxx)", { cwd, stderr: "inherit" });
  COMPILED.add(cwd);
}

/** Invoke the ndn-cxx program in cwd and return line-based output. */
export async function invoke(cwd: string, args?: string[], stdin?: ExecuteOptions["stdin"]): Promise<string[]> {
  await compile(cwd);
  const { stdout } = await execute(["./a.out"].concat(args || []), { cwd, stdin, stderr: "inherit" });
  return stdout!.split("\n");
}
