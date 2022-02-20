#!/usr/bin/env node

import fsWalk from "@nodelib/fs.walk";
import fs from "graceful-fs";
import yaml from "js-yaml";
import path from "node:path";

function* listImports(filename) {
  const lines = fs.readFileSync(filename, { encoding: "utf8" }).split("\n");
  for (const line of lines) {
    const m = /^import(?: .* from)? "([^.@][^":/]*|@[^":/]*\/[^":/]*)[^":]*";/.exec(line);
    if (!m) {
      continue;
    }
    yield m[1];
  }
}

const ignoredUnused = new Set(["graphql", "hard-rejection", "tslib"]);
const ignoredTypes = new Set(["yargs"]);

let nWarnings = 0;
const doc = yaml.load(fs.readFileSync("pnpm-lock.yaml"));
for (const [folder, { dependencies = {}, devDependencies = {} }] of Object.entries(doc.importers)) {
  if (!folder.startsWith("packages/")) {
    continue;
  }
  const unused = new Set(Object.keys(dependencies).filter((dep) => !ignoredUnused.has(dep)));

  const sources = fsWalk.walkSync(path.join(folder, "lib"), {
    entryFilter: ({ dirent, name }) => dirent.isFile() && !name.endsWith(".d.ts"),
  });
  for (const { path: filename } of sources) {
    for (const dep of listImports(filename)) {
      unused.delete(dep);
      if (devDependencies[dep] && !dependencies[dep]) {
        process.stdout.write(`+\t${filename}\t${dep}\n`);
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

  for (const dep of unused) {
    process.stdout.write(`-\t${folder}\t${dep}\n`);
    ++nWarnings;
  }
}

process.exitCode = nWarnings > 0 ? 1 : 0;
