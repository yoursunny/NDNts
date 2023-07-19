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
  typedocOptions: {
    entryPoints: [],
    exclude: ["**/node_modules", "**/lib", "**/test-fixture", "**/tests"],
    excludeExternals: true,
    excludePrivate: true,
    validation: {
      notExported: false,
    },
  },
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

for (const filename of ["src/mod.ts", "src/main.ts"]) {
  try {
    await fs.stat(filename);
    tsconfig.typedocOptions.entryPoints.push(filename);
  } catch {}
}

await fs.writeFile("tsconfig.json", JSON.stringify(tsconfig, undefined, 2));

const tsconfigTestFixture = {
  extends: "../../../mk/tsconfig-base.json",
  compilerOptions: {
    rootDir: "..",
  },
  include: [
    "..",
  ],
};

let hasTestFixture = false;
try {
  hasTestFixture = (await fs.stat("test-fixture")).isDirectory();
} catch {}
if (hasTestFixture) {
  await fs.writeFile("test-fixture/tsconfig.json", JSON.stringify(tsconfigTestFixture, undefined, 2));
}
