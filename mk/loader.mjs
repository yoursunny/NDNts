import * as K from "@k-foss/ts-esnode";
import path from "path";

export const resolve = K.resolve;
export const transformSource = K.transformSource;

export async function getFormat(url, context, defaultGetFormat) {
  const filename = path.basename(new URL(url).pathname);
  if (filename.endsWith(".ts")) {
    return { format: "module" };
  }
  return defaultGetFormat(url, context, defaultGetFormat);
}
