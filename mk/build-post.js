const builtins = require("builtins")();
const { promises: fs } = require("fs");
const { pipeline } = require("stream");
const split2 = require("split2");

/**
 * @param {string} filename
 * @param {string[]} lines
 */
function delayedWrite(filename, lines) {
  setTimeout(() => fs.writeFile(filename, lines.join("\n")), 2000);
}

/**
 * @param {string} filename
 */
async function transformDeclaration(filename) {
  let lines = (await fs.readFile(filename, "utf-8")).split("\n");
  lines = lines.filter((l) => !l.startsWith("//# sourceMappingURL="));
  delayedWrite(filename, lines);
}

// Whitelist of packages published with ES Module entrypoint.
const ESM_IMPORTS = new Set([...builtins]);

/**
 * @param {string} filename
 */
async function transformJs(filename) {
  let lines = (await fs.readFile(filename, { encoding: "utf-8" })).split("\n");
  let needRequire = false;
  lines = lines.flatMap((/** @type string */line) => {
    line = line.replace(/\r$/, "");
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
  delayedWrite(filename, lines);
}

(async () => {
const lines = split2();
pipeline(process.stdin, lines,
  (err) => { if (err) { console.error(err); } });

lines.on("data", async (/** @type string */line) => {
  if (!line.startsWith("TSFILE: ")) {
    process.stdout.write(`${line}\n`);
    return;
  }
  const filename = line.slice(8);
  try {
    if (filename.endsWith(".map")) {
      await fs.unlink(filename);
    } else if (filename.endsWith(".d.ts")) {
      await transformDeclaration(filename);
    } else if (filename.endsWith(".js")) {
      await transformJs(filename);
    }
  } catch (err) {
    console.warn(filename, err);
  }
});
})();
