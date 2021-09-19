#!/usr/bin/env node
// Check DefinitelyTyped packages declared as dependencies vs devDependencies.

import fsWalk from "@nodelib/fs.walk";
import fs from "graceful-fs";
import yaml from "js-yaml";
import path from "node:path";

const IGNORED = new Set(["yargs"]);

let nWarnings = 0;
const doc = yaml.load(fs.readFileSync("pnpm-lock.yaml"));
for (const [folder, { dependencies = {}, devDependencies = {} }] of Object.entries(doc.importers)) {
  if (!folder.startsWith("packages/")) {
    continue;
  }
  const unused = new Set(Object.keys(dependencies).filter((dep) => dep.startsWith("@types/")));

  const files = fsWalk.walkSync(path.join(folder, "lib"), {
    entryFilter: ({ dirent, name, path }) => dirent.isFile() && name.endsWith(".d.ts") && !path.includes("/detail/"),
  });
  for (const { path: filename } of files) {
    const lines = fs.readFileSync(filename, { encoding: "utf8" }).split("\n");
    for (const line of lines) {
      const m = /^import .* from "([^"]+)";$/.exec(line);
      if (!m || IGNORED.has(m[1])) {
        continue;
      }
      const dep = `@types/${m[1]}`;
      unused.delete(dep);
      if (devDependencies[dep] && !dependencies[dep]) {
        process.stdout.write(`+\t${filename}\t${dep}\n`);
        ++nWarnings;
      }
    }
  }

  for (const dep of unused) {
    process.stdout.write(`-\t${folder}\t${dep}\n`);
    ++nWarnings;
  }
}

process.exitCode = nWarnings > 0 ? 1 : 0;
