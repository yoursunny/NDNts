const fs = require("fs");
const path = require("path");
const rootdir = path.resolve(__dirname, "..");

const tsconfig = {
  extends: "../../mk/tsconfig-base.json",
  compilerOptions: {
    rootDir: "./src",
    outDir: "./lib",
  },
  include: ["src"],
  references: [],
};

const pkg = JSON.parse(fs.readFileSync("package.json"));
for (const [dep, specifier] of Object.entries(pkg.dependencies)) {
  if (specifier.startsWith("workspace:")) {
    tsconfig.references.push({
      path: path.relative(process.cwd(), path.resolve(rootdir, "packages", path.basename(dep))).replace(path.sep, path.posix.sep),
    });
  }
}

fs.writeFileSync("tsconfig.json", JSON.stringify(tsconfig, undefined, 2));
