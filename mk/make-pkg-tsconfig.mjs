import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootdir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @type {import("type-fest").TsConfigJson & { typedocOptions: import("typedoc").TypeDocOptions }} */
const tsconfig = {
  extends: "../../mk/tsconfig-base.json",
  compilerOptions: {
    rootDir: "./src",
    outDir: "./lib",
  },
  include: ["src"],
  references: [],
  typedocOptions: {
    entryPoints: [],
    exclude: ["**/node_modules", "**/lib", "**/test-fixture", "**/tests"],
    excludeExternals: true,
    excludePrivate: true,
    jsDocCompatibility: false,
    validation: {
      notExported: false,
    },
  },
};

/** @type {import("type-fest").PackageJson} */
const pkg = JSON.parse(await fs.readFile("package.json"));
for (const [dep, specifier] of Object.entries(pkg.dependencies)) {
  if (specifier.startsWith("workspace:")) {
    tsconfig.references.push({
      path: path.relative(process.cwd(), path.resolve(rootdir, "pkg", path.basename(dep)))
        .split(path.sep).join(path.posix.sep),
    });
  }
}

for (const filename of ["src/mod.ts", "src/main.ts"]) {
  try {
    await fs.stat(filename);
    tsconfig.typedocOptions.entryPoints.push(filename);
  } catch {}
}

await fs.writeFile("tsconfig.json", JSON.stringify(tsconfig, undefined, 2));

/** @type {typeof tsconfig} */
const tsconfigTest = {
  extends: "../../../mk/tsconfig-base.json",
  compilerOptions: {
    rootDir: "..",
  },
  include: [
    "..",
  ],
};

for (const dir of ["test-fixture", "tests"]) {
  let found = false;
  try {
    found = (await fs.stat(dir)).isDirectory();
  } catch {}
  if (found) {
    await fs.writeFile(path.join(dir, "tsconfig.json"), JSON.stringify(tsconfigTest, undefined, 2));
  }
}
