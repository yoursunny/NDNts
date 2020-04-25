import { dynamicInstantiate as tsesnodeDynamicInstantiate, resolve as tsesnodeResolve } from "@k-foss/ts-esnode";
export { getFormat, transformSource } from "@k-foss/ts-esnode";
import { getTSConfig } from "@k-foss/ts-esnode/out/dist/Utils.js";
import * as fs from "fs";
import { createRequire } from "module";
import { dirname, resolve as pathResolve } from "path";
import { fileURLToPath } from "url";

const baseDir = pathResolve(dirname(fileURLToPath(import.meta.url)), "../");
getTSConfig(`${baseDir}/mk/literate-tsconfig/`);

/**
 *
 * @param {string} specifier
 * @param {{ parentURL: string; conditions: string[] }} context
 * @param {function} defaultResolve
 * @return {Promise<{url: string}>}
 */
export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith("@ndn/")) {
    specifier = specifier.replace(/^@ndn\//, `${baseDir}/packages/`);
  }
  try {
    const j = JSON.parse(fs.readFileSync(`${specifier}/package.json`, "utf-8"));
    if (j.main) {
      specifier = pathResolve(specifier, j.main);
    }
  } catch (err) {}
  return tsesnodeResolve(specifier, context, defaultResolve);
}

/**
 *
 * @param {string} url
 * @return {Promise<string>}
 */
export async function dynamicInstantiate(url) {
  const urlParts = url.split("/node_modules/");
  urlParts.pop();
  const require = createRequire(
    `${urlParts.join("/node_modules/").replace("file://", "")}/node_modules/`,
  );

  let dynModule = require(url.replace(/.*\/node_modules\//, ""));
  if (dynModule.default && dynModule !== dynModule.default) {
    dynModule = {
      ...dynModule.default,
      ...dynModule,
    };
  }

  const linkKeys = Object.keys(dynModule);
  const exports = dynModule.default ? linkKeys : [...linkKeys, "default"];

  return {
    exports,
    execute: (module) => {
      module.default.set(dynModule);
      for (const linkKey of linkKeys) {module[linkKey].set(dynModule[linkKey]);}
    },
  };
}
