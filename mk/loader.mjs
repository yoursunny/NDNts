import * as K from "@k-foss/ts-esnode";
import fs from "graceful-fs";

export const resolve = K.resolve;

export async function load(url, context, defaultLoad) {
  const { pathname } = new URL(url);
  if (!pathname.endsWith(".ts")) {
    return defaultLoad(url, context, defaultLoad);
  }
  const content = await fs.promises.readFile(pathname, { encoding: "utf-8" });
  const { source } = await K.transformSource(content, {
    format: "module",
    url,
  }, () => { throw new Error("unexpected call to defaultTransformSource"); });
  return {
    format: "module",
    source,
  };
}
