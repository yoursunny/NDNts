export { dynamicInstantiate, getFormat, transformSource } from "@k-foss/ts-esnode";
import { getTSConfig } from "@k-foss/ts-esnode/out/dist/Utils.js";
import { promises as fs } from "fs";
import { dirname, resolve as pathResolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const baseDir = pathResolve(dirname(fileURLToPath(import.meta.url)), "../");
getTSConfig(`${baseDir}/mk/esm-loader-tsconfig/`);

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
    try {
      const j = JSON.parse(await fs.readFile(`${specifier}/package.json`, "utf-8"));
      Object.assign(j, j.publishConfig);
      if (j.main) {
        specifier = pathResolve(specifier, j.main);
      }
    } catch {}
    specifier = pathToFileURL(specifier).toString();
  }
  return defaultResolve(specifier, context, defaultResolve);
}
