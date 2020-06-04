const fs = require("graceful-fs");

const tsconfig = {
  extends: "../mk/tsconfig-base.json",
  include: [],
  references: [],
};

fs.readdirSync("packages", { withFileTypes: true })
  .forEach((direct) => {
    if (!direct.isDirectory()) {
      return;
    }
    tsconfig.references.push({ path: `../packages/${direct.name}` });
  });

fs.writeFileSync("mk/tsconfig-solution.json", JSON.stringify(tsconfig, undefined, 2));
