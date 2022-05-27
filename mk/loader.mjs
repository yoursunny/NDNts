import * as K from "@k-foss/ts-esnode";
import codedown from "codedown";
import fs from "graceful-fs";
import { promisify } from "node:util";
import readlink from "readlink";

const readlinkPromise = promisify(readlink);

/**
 * Node.js loader resolve hook.
 * @param {string} specifier
 * @param {{ conditions: string[], parentURL: string | undefined }} context
 * @param {typeof resolve} defaultResolve
 * @returns {Promise<{ url: string }>}
 */
export async function resolve(specifier, context, defaultResolve) {
  try {
    const { protocol, pathname } = new URL(specifier);
    if (protocol === "file:" && pathname.endsWith(".md")) {
      return {
        format: "module",
        url: `${specifier}.ts`,
      };
    }
  } catch {}
  const r = await K.resolve(specifier, context, defaultResolve);
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
  return r;
}

/**
 * Node.js loader load hook.
 * @param {string} url
 * @param {{ format: string }} context
 * @param {typeof load} defaultLoad
 * @returns {Promise<{ format: string, source: string | ArrayBuffer | SharedArrayBuffer | Uint8Array }>}
 */
export async function load(url, context, defaultLoad) {
  let { protocol, pathname } = new URL(url);
  if (!(protocol === "file:" && pathname.endsWith(".ts"))) {
    return defaultLoad(url, context, defaultLoad);
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
    url,
  }, () => { throw new Error("unexpected call to defaultTransformSource"); });

  return {
    format: "module",
    source,
  };
}
