import * as fs from "fs";
import mkdirp = require("mkdirp");
import * as path from "path";

interface PackageInfo {
  name: string;
  abspath: string;
  deps: string[];
}

function gatherPackageInfo(pkgPath): PackageInfo|undefined {
  const jsonPath = path.join(pkgPath, "/package.json");
  try {
    fs.accessSync(jsonPath, fs.constants.R_OK);
  } catch {
    return undefined;
  }
  const packageJson = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const pi = {
    name: packageJson.name,
    abspath: fs.realpathSync(pkgPath),
    deps: [] as string[],
  } as PackageInfo;
  ["dependencies", "devDependencies", "optionalDependencies"].forEach((key) => {
    if (typeof packageJson[key] === "object") {
      pi.deps = pi.deps.concat(Object.keys(packageJson[key]));
    }
  });
  return pi;
}

const pkgs = Object.fromEntries(
  fs.readdirSync("packages", { withFileTypes: true })
  .filter((direct) => direct.isDirectory())
  .map((direct) => "packages/" + direct.name)
  .map(gatherPackageInfo)
  .filter((pi) => typeof pi !== "undefined")
  .map((pi) => [pi!.name, pi!]),
);

Object.keys(pkgs).forEach((name) => {
  const pi = pkgs[name];
  const modulesPath = path.join(pi.abspath, "node_modules");
  pi.deps.filter((dep) => !!pkgs[dep]).forEach((dep) => {
    const linkPath = path.join(modulesPath, dep);
    if (fs.existsSync(linkPath)) {
      return;
    }
    mkdirp.sync(path.dirname(linkPath));
    fs.symlinkSync(pkgs[dep].abspath, linkPath);
  });
});
