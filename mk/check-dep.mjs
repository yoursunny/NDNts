#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";

import fsWalk from "@nodelib/fs.walk";
import { satisfies } from "compare-versions";
import yaml from "js-yaml";

function* listImports(filename) {
  const lines = readFileSync(filename, "utf8").split("\n");
  for (const line of lines) {
    const m = /(?:import|export)(?:\(|(?: .* from)? )"([^.@][^":/]*|@[^":/]*\/[^":/]*)[^":]*"[;)]/.exec(line);
    if (!m) {
      continue;
    }
    yield m[1];
  }
}

const ignoredFolder = new Set([
  "pkg/repo-external", // multi-line re-export, not handled by this script
  "pkg/sync", // multi-line re-export, not handled by this script
]);
const ignoredMissing = new Set(["memif"]);
const ignoredUnused = new Set(["@types/web-bluetooth", "graphql", "tslib"]);
const ignoredTypes = new Set(["yargs"]);

/** @type {import("@pnpm/lockfile-types").Lockfile} */
const doc = yaml.load(readFileSync("pnpm-lock.yaml", "utf8"));
if (!satisfies(doc.lockfileVersion, "^9.0.0")) {
  throw new Error("lockfileVersion not supported");
}

let nWarnings = 0;
for (const [folder, { dependencies = {}, devDependencies = {} }] of Object.entries(doc.importers)) {
  if (!folder.startsWith("pkg/") || ignoredFolder.has(folder)) {
    continue;
  }
  const unusedP = new Set(Object.keys(dependencies).filter((dep) => !ignoredUnused.has(dep)));
  const unusedD = new Set(Object.keys(devDependencies).filter((dep) => !ignoredUnused.has(dep)));

  const libFolder = path.join(folder, "lib");
  const jsFiles = fsWalk.walkSync(libFolder, {
    entryFilter: ({ dirent, name }) => dirent.isFile() && !name.endsWith(".d.ts"),
  });
  for (const { path: filename } of jsFiles) {
    for (const dep of listImports(filename)) {
      unusedP.delete(dep);
      if (!dependencies[dep] && !isBuiltin(dep) && !ignoredMissing.has(dep)) {
        process.stdout.write(`P+\t${filename}\t${dep}\n`);
        ++nWarnings;
      }
    }
  }

  const declarations = fsWalk.walkSync(libFolder, {
    entryFilter: ({ dirent, name }) => dirent.isFile() && name.endsWith(".d.ts"),
  });
  for (const { path: filename } of declarations) {
    for (const imp of listImports(filename)) {
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
    for (const imp of listImports(filename)) {
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
