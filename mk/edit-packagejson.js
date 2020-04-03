const fs = require("fs");
const path = require("path");

const act = process.argv[2];

const j = JSON.parse(fs.readFileSync("package.json"));

if (act.includes("V")) {
  j.version = process.argv[3];
}

if (act.includes("C") && j.publishConfig) {
  Object.assign(j, j.publishConfig);
  delete j.publishConfig;
}

if (act.includes("D")) {
  delete j.devDependencies;
}

if (act.includes("N")) {
  for (const [dep, specifier] of Object.entries(j.dependencies)) {
    if (specifier.startsWith("workspace:")) {
      j.dependencies[dep] = `https://ndnts-nightly.netlify.app/${path.basename(dep)}.tgz`;
    }
  }
}

if (act.includes("R")) {
  for (const [dep, specifier] of Object.entries(j.dependencies)) {
    if (specifier.startsWith("workspace:")) {
      j.dependencies[dep] = process.argv[3];
    }
  }
}

fs.writeFileSync("package.json", JSON.stringify(j, undefined, 2));
