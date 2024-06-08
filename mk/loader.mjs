import fs from "node:fs/promises";
import { promisify } from "node:util";

import * as K from "@k-foss/ts-esnode";
import codedown from "codedown";
import readlink from "readlink";

const readlinkPromise = promisify(readlink);

/**
 * @typedef {import("node:module").ResolveHookContext} ResolveHookContext
 * @typedef {import("node:module").ResolveFnOutput} ResolveFnOutput
 * @typedef {import("node:module").LoadHookContext} LoadHookContext
 * @typedef {import("node:module").LoadFnOutput} LoadFnOutput
 */

/**
 * Node.js loader resolve hook.
 * @param {string} specifier
 * @param {ResolveHookContext} context
 * @param {(specifier: string, context: ResolveHookContext) => Promise<ResolveResult>} nextResolve
 * @returns {Promise<ResolveFnOutput>}
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
 * Node.js loader load hook.
 * @param {string} url
 * @param {LoadHookContext} context
 * @param {(url: string, context: LoadHookContext) => Promise<LoadFnOutput>} nextLoad
 * @returns {Promise<LoadFnOutput>}
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
  let content = await fs.readFile(pathname, "utf8");
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
