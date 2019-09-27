const fs = require("fs");
const path = require("path");

const tsconfig = {
  extends: "./mk/tsconfig.build.json",
  compilerOptions: {
    baseUrl: ".",
    paths: {},
  },
};

fs.readdirSync("packages", { withFileTypes: true })
.forEach((direct) => {
  if (!direct.isDirectory()) {
    return;
  }
  const packageJsonPath = path.join("packages", direct.name, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return;
  }
  const { name, private } = JSON.parse(fs.readFileSync(packageJsonPath));
  if (!!private || !name) {
    return;
  }
  tsconfig.compilerOptions.paths[name] = [path.posix.join("packages", direct.name)];
});

fs.writeFileSync(path.resolve(__dirname, "..", "tsconfig.json"),
                 JSON.stringify(tsconfig, undefined, 2));
