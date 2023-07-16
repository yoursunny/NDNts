#!/usr/bin/env node

import fs from "node:fs/promises";
import { isBuiltin } from "node:module";
import path from "node:path";

import fsWalk from "@nodelib/fs.walk";
import { satisfies } from "compare-versions";
import yaml from "js-yaml";

async function* listImports(filename) {
  const lines = (await fs.readFile(filename, "utf8")).split("\n");
  for (const line of lines) {
    const m = /import(?:\(|(?: .* from)? )"([^.@][^":/]*|@[^":/]*\/[^":/]*)[^":]*"[;)]/.exec(line);
    if (!m) {
      continue;
    }
    yield m[1];
  }
}

const ignoredMissing = new Set(["memif"]);
const ignoredUnused = new Set(["@types/web-bluetooth", "graphql", "tslib"]);
const ignoredTypes = new Set(["yargs"]);

const doc = yaml.load(await fs.readFile("pnpm-lock.yaml"));
if (!satisfies(doc.lockfileVersion, "^6.0.0")) {
  throw new Error("lockfileVersion not supported");
}

let nWarnings = 0;
for (const [folder, { dependencies = {}, devDependencies = {} }] of Object.entries(doc.importers)) {
  if (!folder.startsWith("packages/")) {
    continue;
  }
  const unusedP = new Set(Object.keys(dependencies).filter((dep) => !ignoredUnused.has(dep)));
  const unusedD = new Set(Object.keys(devDependencies).filter((dep) => !ignoredUnused.has(dep)));

  const jsFiles = fsWalk.walkSync(path.join(folder, "lib"), {
    entryFilter: ({ dirent, name }) => dirent.isFile() && !name.endsWith(".d.ts"),
  });
  for (const { path: filename } of jsFiles) {
    for await (const dep of listImports(filename)) {
      unusedP.delete(dep);
      if (!dependencies[dep] && !isBuiltin(dep) && !ignoredMissing.has(dep)) {
        process.stdout.write(`P+\t${filename}\t${dep}\n`);
        ++nWarnings;
      }
    }
  }

  const declarations = fsWalk.walkSync(path.join(folder, "lib"), {
    entryFilter: ({ dirent, name }) => dirent.isFile() && name.endsWith(".d.ts"),
  });
  for (const { path: filename } of declarations) {
    for await (const imp of listImports(filename)) {
      unusedP.delete(imp);
      const dep = `@types/${imp}`;
      unusedP.delete(dep);
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
    for await (const imp of listImports(filename)) {
      unusedD.delete(imp);
      unusedD.delete(`@types/${imp}`);
    }
  }

  for (const dep of unusedP) {
    process.stdout.write(`P-\t${folder}\t${dep}\n`);
    ++nWarnings;
  }
  for (const dep of unusedD) {
    process.stdout.write(`D-\t${folder}\t${dep}\n`);
    ++nWarnings;
  }
}

process.exitCode = Number(nWarnings > 0);
