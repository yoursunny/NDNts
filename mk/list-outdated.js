// This script lists dependencies where pnpm installed version differs from package.json specifier.
const fs = require("graceful-fs");
const yaml = require("js-yaml");

const doc = yaml.load(fs.readFileSync("pnpm-lock.yaml"));
for (const [folder, { specifiers, dependencies, devDependencies }] of Object.entries(doc.importers)) {
  for (const list of [dependencies, devDependencies]) {
    for (const [dep, version] of Object.entries(list || {})) {
      const specifier = specifiers[dep];
      if (/[*:]/.test(specifier)) {
        continue;
      }
      if (!version.startsWith(specifier.replace(/^[~^]/, ""))) {
        process.stdout.write(`${folder}\t${dep}\t${specifier}\t${version}\n`);
      }
    }
  }
}
