// ES Module import paths should be URIs with '.js' extension.
// TypeScript allows '.js' in import paths, but ts-jest is unhappy.
// I have to leave '.js' off in TypeScript import paths, and modify the output files before publishing.
// To enable this transform, 'index.ts' should be avoided in favor of 'mod.ts'.
//
// Node >=12.16 forbids importing CommonJS with `import`.
// Thus, I have to replace `import` to `require`.
// However, webpack is unhappy about `createRequire`.
// So I kept both variants, and webapps will have to use ifdef-loader.
//
// Source Maps are stripped because (1) files are modified (2) source '.ts' files are not in package.

const { readFileSync, writeFileSync } = require("fs");
const builtins = require("builtins")();

// Whitelist of packages published with ES Module entrypoint.
const ESM_IMPORTS = new Set([...builtins]);

for (const filename of process.argv.slice(2)) {
  /** @type string[] */
  let lines = readFileSync(filename, { encoding: "utf-8" }).split("\n");
  let needRequire = false;
  lines = lines.flatMap((input) => {
    /** @type string */
    const line = input.replace(/\r$/, "");
    if ((line.startsWith("import ") || line.startsWith("export ")) && line.includes(" from \".")) {
      return line.replace(/(\.js)?";$/, ".js\";");
    }
    if (line.startsWith("import ")) {
      const m = line.match(/^import (?:\* as )?(.*) from "(.*)";$/);
      if (!m) {
        return line;
      }
      let [, imports, specifier] = m;
      const pkg = specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
      if (pkg.startsWith("@ndn/") || ESM_IMPORTS.has(pkg)) {
        return line;
      }
      needRequire = true;
      let requirePrefix = "";
      let requireSuffix = "";
      if (imports.startsWith("* as ")) {
        imports = imports.slice(5);
      } else if (imports.startsWith("{")) {
        imports = imports.replace(/ as /g, ": ");
      } else {
        requirePrefix = "__importDefault(";
        requireSuffix = ").default";
      }
      return [
        "/// #if false",
        `const ${imports} = ${requirePrefix}require("${specifier}")${requireSuffix};`,
        "/*",
        "/// #else",
        line,
        "/// #endif",
        "/// #if false",
        "*/",
        "/// #endif",
      ];
    }
    if (line.startsWith("//# sourceMappingURL=")) {
      return "";
    }
    return line;
  });
  if (needRequire) {
    lines.unshift(
      "/// #if false",
      "import { createRequire } from \"module\";",
      "const require = createRequire(import.meta.url);",
      "const { __importDefault } = require(\"tslib\");",
      "/// #endif",
    );
  }
  writeFileSync(filename, lines.join("\n"), { encoding: "utf-8" });
}
