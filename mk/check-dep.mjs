#!/usr/bin/env node

import fsWalk from "@nodelib/fs.walk";
import Builtins from "builtins";
import fs from "graceful-fs";
import yaml from "js-yaml";
import path from "node:path";

const builtins = new Set(Builtins());

function* listImports(filename) {
  const lines = fs.readFileSync(filename, "utf8").split("\n");
  for (const line of lines) {
    const m = /^import(?: .* from)? "([^.@][^":/]*|@[^":/]*\/[^":/]*)[^":]*";/.exec(line);
    if (!m) {
      continue;
    }
    yield m[1];
  }
}

const ignoredUnused = new Set(["@types/web-bluetooth", "graphql", "hard-rejection", "tslib"]);
const ignoredTypes = new Set(["yargs"]);

let nWarnings = 0;
const doc = yaml.load(fs.readFileSync("pnpm-lock.yaml"));
for (const [folder, { dependencies = {}, devDependencies = {} }] of Object.entries(doc.importers)) {
  if (!folder.startsWith("packages/")) {
    continue;
  }
  const unused = new Set(Object.keys(dependencies).filter((dep) => !ignoredUnused.has(dep)));
  const unusedD = new Set(Object.keys(devDependencies).filter((dep) => !ignoredUnused.has(dep)));

  const jsFiles = fsWalk.walkSync(path.join(folder, "lib"), {
    entryFilter: ({ dirent, name }) => dirent.isFile() && !name.endsWith(".d.ts"),
  });
  for (const { path: filename } of jsFiles) {
    for (const dep of listImports(filename)) {
      unused.delete(dep);
      if (!dependencies[dep] && !builtins.has(dep)) {
        process.stdout.write(`P+\t${filename}\t${dep}\n`);
        ++nWarnings;
      }
    }
  }

  const declarations = fsWalk.walkSync(path.join(folder, "lib"), {
    entryFilter: ({ dirent, name }) => dirent.isFile() && name.endsWith(".d.ts"),
  });
  for (const { path: filename } of declarations) {
    for (const imp of listImports(filename)) {
      unused.delete(imp);
      const dep = `@types/${imp}`;
      unused.delete(dep);
      if (!ignoredTypes.has(imp) && devDependencies[dep] && !dependencies[dep] && !filename.includes("/detail/")) {
        process.stdout.write(`+\t${filename}\t${dep}\n`);
        ++nWarnings;
      }
    }
  }

  const tsFiles = fsWalk.walkSync(folder, {
    deepFilter: ({ name }) => !["lib", "node_modules"].includes(name),
    entryFilter: ({ dirent, name }) => dirent.isFile() && name.endsWith(".ts"),
  });
  for (const { path: filename } of tsFiles) {
    for (const imp of listImports(filename)) {
      unusedD.delete(imp);
      unusedD.delete(`@types/${imp}`);
    }
  }

  for (const dep of unused) {
    process.stdout.write(`P-\t${folder}\t${dep}\n`);
    ++nWarnings;
  }
  for (const dep of unusedD) {
    process.stdout.write(`D-\t${folder}\t${dep}\n`);
    ++nWarnings;
  }
}

process.exitCode = nWarnings > 0 ? 1 : 0;
