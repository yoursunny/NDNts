import * as K from "@k-foss/ts-esnode";
import fs from "graceful-fs";
import path from "node:path";

export const resolve = K.resolve;
export const transformSource = K.transformSource;

export async function getFormat(url, context, defaultGetFormat) {
  const filename = path.basename(new URL(url).pathname);
  if (filename.endsWith(".ts")) {
    return { format: "module" };
  }
  return defaultGetFormat(url, context, defaultGetFormat);
}

export async function load(url, context, defaultLoad) {
  const { pathname } = new URL(url);
  if (!pathname.endsWith(".ts")) {
    return defaultLoad(url, context, defaultLoad);
  }
  const typescript = await fs.promises.readFile(pathname, { encoding: "utf-8" });
  const { source } = await K.transformSource(typescript, {
    format: "module",
    url,
  }, () => { throw new Error("unexpected call to defaultTransformSource"); });
  return {
    format: "module",
    source,
  };
}
