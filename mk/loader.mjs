import * as K from "@k-foss/ts-esnode";
import codedown from "codedown";
import fs from "graceful-fs";

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
  return K.resolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  let { pathname } = new URL(url);
  if (!pathname.endsWith(".ts")) {
    return defaultLoad(url, context, defaultLoad);
  }

  const isLiterate = pathname.endsWith(".md.ts");
  if (isLiterate) {
    pathname = pathname.slice(0, -3);
  }
  let content = await fs.promises.readFile(pathname, { encoding: "utf-8" });
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
