const fs = require("graceful-fs");

const tsconfig = {
  extends: "../mk/tsconfig-base.json",
  include: [],
  references: [],
};

const dir = fs.readdirSync("packages", { withFileTypes: true });
for (const direct of dir) {
  if (!direct.isDirectory()) {
    continue;
  }
  tsconfig.references.push({ path: `../packages/${direct.name}` });
}

fs.writeFileSync("mk/tsconfig-solution.json", JSON.stringify(tsconfig, undefined, 2));
