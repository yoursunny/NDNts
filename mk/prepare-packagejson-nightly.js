const fs = require("fs");
const path = require("path");

const j = JSON.parse(fs.readFileSync("package.json"));

j.version = process.argv[2];

if (j.publishConfig) {
  Object.assign(j, j.publishConfig);
  delete j.publishConfig;
}

delete j.devDependencies;

for (let [dep, specifier] of Object.entries(j.dependencies)) {
  if (/^workspace:/.test(specifier)) {
    j.dependencies[dep] = `https://ndnts-nightly.netlify.com/${path.basename(dep)}.tgz`;
  }
}

fs.writeFileSync("package.json", JSON.stringify(j, undefined, 2));
