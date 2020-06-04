const assert = require("assert");
const fs = require("graceful-fs");
const { safeLoad } = require("js-yaml");
const path = require("path");

const doc = safeLoad(fs.readFileSync("pnpm-lock.yaml"));
const [[, { dependencies }]] = Object.entries(doc.packages)
  .filter(([name]) => name.startsWith("/xo/"));
assert(dependencies);

const xoNodeModules = path.resolve(fs.readlinkSync("./node_modules/xo"), "..");
for (const dep of Object.keys(dependencies)) {
  if (!(dep.startsWith("eslint-") || dep.includes("/eslint-"))) {
    continue;
  }
  const depDir = path.resolve(xoNodeModules, dep);
  const depLink = path.resolve("./node_modules", dep);
  if (fs.existsSync(depDir) && !fs.existsSync(depLink)) {
    const [scope, bare] = dep.split("/");
    if (bare) {
      const scopeDir = path.resolve("./node_modules", scope);
      if (!fs.existsSync(scopeDir)) {
        fs.mkdirSync(scopeDir);
      }
    }
    fs.symlinkSync(depDir, depLink, "junction");
  }
}
