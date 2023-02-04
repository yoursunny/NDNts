import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootdir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const tsconfig = {
  extends: "../../mk/tsconfig-base.json",
  compilerOptions: {
    rootDir: "./src",
    outDir: "./lib",
  },
  include: ["src"],
  references: [],
};

const pkg = JSON.parse(await fs.readFile("package.json"));
for (const [dep, specifier] of Object.entries(pkg.dependencies)) {
  if (specifier.startsWith("workspace:")) {
    tsconfig.references.push({
      path: path.relative(process.cwd(), path.resolve(rootdir, "packages", path.basename(dep)))
        .split(path.sep).join(path.posix.sep),
    });
  }
}

await fs.writeFile("tsconfig.json", JSON.stringify(tsconfig, undefined, 2));
