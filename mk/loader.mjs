import { promisify } from "node:util";

import * as K from "@k-foss/ts-esnode";
import codedown from "codedown";
import fs from "graceful-fs";
import readlink from "readlink";

const readlinkPromise = promisify(readlink);

/**
 * @typedef {{
 *  conditions: string[];
 *  importAssertions: object;
 *  parentURL?: string;
 * }} ResolveContext
 *
 * @typedef {{
 *  format?: string;
 *  shortCircuit?: boolean;
 *  url: string;
 * }} ResolveResult
 */

/**
 * Node.js loader resolve hook.
 * @param {string} specifier
 * @param {ResolveContext} context
 * @param {(specifier: string, context: ResolveContext) => Promise<ResolveResult>} nextResolve
 * @returns {Promise<ResolveResult>}
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    const { protocol, pathname } = new URL(specifier);
    if (protocol === "file:" && pathname.endsWith(".md")) {
      return {
        format: "module",
        shortCircuit: true,
        url: `${specifier}.ts`,
      };
    }
  } catch {}

  const r = await K.resolve(specifier, context, nextResolve);
  try {
    const u = new URL(r.url);
    if (u.protocol === "file:") {
      if (specifier.startsWith("@ndn/") && u.pathname.endsWith("/src/mod.ts")) {
        u.pathname = u.pathname.replace(/\/src\/mod.ts$/, "/lib/mod_node.js");
      }
      u.pathname = await readlinkPromise(u.pathname);
    }
    r.url = u.toString();
  } catch {}
  return {
    shortCircuit: true,
    ...r,
  };
}
/**
 * @typedef {{
 *  conditions: string[];
 *  format?: string;
 *  importAssertions: object;
 * }} LoadContext
 *
 * @typedef {{
 *  format?: string;
 *  shortCircuit?: boolean;
 *  source: string | ArrayBuffer | Uint8Array;
 * }} LoadResult
 */

/**
 * Node.js loader load hook.
 * @param {string} url
 * @param {LoadContext} context
 * @param {(url: string, context: LoadContext) => Promise<LoadResult>} nextLoad
 * @returns {Promise<LoadResult>}
 */
export async function load(url, context, nextLoad) {
  let { protocol, pathname } = new URL(url);
  if (!(protocol === "file:" && pathname.endsWith(".ts"))) {
    return nextLoad(url, context);
  }

  const isLiterate = pathname.endsWith(".md.ts");
  if (isLiterate) {
    pathname = pathname.replace(/\.md\.ts$/, ".md");
  }
  let content = await fs.promises.readFile(pathname, "utf8");
  if (isLiterate) {
    content = codedown(content, "ts");
  }

  const { source } = await K.transformSource(content, {
    format: "module",
    shortCircuit: true,
    url,
  }, () => { throw new Error("unexpected call to defaultTransformSource"); });

  return {
    format: "module",
    shortCircuit: true,
    source,
  };
}
