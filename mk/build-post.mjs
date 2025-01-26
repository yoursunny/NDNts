import fs from "node:fs/promises";
import { pipeline } from "node:stream";

import split2 from "split2";

/**
 * Write to a file later, to avoid conflicts with tsc.
 * @param {string} filename
 * @param {false|string[]} lines
 */
function delayedWrite(filename, lines) {
  setTimeout(() => {
    if (lines === false) {
      fs.unlink(filename);
    } else {
      fs.writeFile(filename, lines.join("\n"));
    }
  }, 2000);
}

/**
 * Match import or export statement.
 * @param {string} line
 */
function matchImportExport(line) {
  const m = /^(import|export) (\* as )?(.*?)( from )?["'](.*)["'];$/.exec(line);
  if (!m) {
    return false;
  }

  const [, action, allAs = "", imports, from = "", specifier] = m;
  return { action, allAs, imports, from, specifier };
}

/**
 * Reconstruct import or export statement.
 * @param {Exclude<ReturnType<typeof matchImportExport>, boolean>} m
 */
function toImportExport(m) {
  const { action, allAs, imports, from, specifier } = m;
  if (action === "export" && allAs) {
    return `import ${allAs}${imports}${from}"${specifier}"; export { ${imports} };`;
  }
  return `${action} ${allAs}${imports}${from}"${specifier}";`;
}

/**
 * Determine if an import specifier refers to a relative path.
 * @param {string} specifier
 */
function isRelativeSpecifier(specifier) {
  return /^\.(?:[^/]*\/)*[^/.]+$/.test(specifier);
}

/**
 * Transform a declaration file.
 * @param {string} filename
 */
async function transformDeclaration(filename) {
  const lines = (await fs.readFile(filename, "utf8")).split("\n").map((line) => {
    if (line.startsWith("//# sourceMappingURL=")) {
      return "";
    }

    const m = matchImportExport(line);
    if (!m) {
      return line;
    }
    if (isRelativeSpecifier(m.specifier)) {
      m.specifier += ".js";
    }
    return toImportExport(m);
  });
  delayedWrite(filename, lines);
}

/**
 * List of packages published with only CommonJS entrypoint.
 * All other packages are assumed to have ES Module entrypoint.
 */
const CJS_IMPORTS = new Set([
  "@yoursunny/asn1",
  "applymixins",
  "buffer-compare",
  "env-var",
  "event-iterator",
  "fast-chunk-string",
  "it-keepalive",
  "lru_map",
  "nodemailer",
  "obliterator",
  "progress",
  "prompts",
  "retry",
  "wtfnode",
]);

/** Transform a JavaScript file. */
class TransformJs {
  /**
   * @param {string} filename
   */
  constructor(filename) {
    this.filename = filename;

    /** Number of transformed CommonJS imports. */
    this.nCjsImports = 0;

    /**
     * Output lines for Node.
     * @type {string[]}
     */
    this.nodeOutput = [];

    /**
     * Output lines for browser.
     * @type {string[]}
     */
    this.browserOutput = [];
  }

  async execute() {
    const input = (await fs.readFile(this.filename, "utf8")).split(/\r?\n/);
    for (const line of input) {
      switch (true) {
        case line.startsWith("import ") || line.startsWith("export "): {
          this.transformImportExport(line);
          break;
        }
        case line.startsWith("//# sourceMappingURL="): {
          break;
        }
        default: {
          this.emitLine(line);
          break;
        }
      }
    }

    if (this.nCjsImports > 0) {
      const tslibImport = "import { __importDefault, __importStar } from \"tslib\";";
      this.nodeOutput.unshift(tslibImport);
      this.browserOutput.unshift(tslibImport);
    }

    const basename = this.filename.replace(/(_node|_browser)?\.js$/, "");
    const nodeOnly = this.filename.endsWith("_node.js");
    const browserOnly = this.filename.endsWith("_browser.js");
    if (!browserOnly) {
      delayedWrite(`${basename}_node.js`, this.nodeOutput);
    }
    if (!nodeOnly) {
      delayedWrite(`${basename}_browser.js`, this.browserOutput);
    }
    if (!nodeOnly && !browserOnly) {
      delayedWrite(this.filename, false);
    }
  }

  /**
   * Output a line.
   * @param {string} node line for Node
   * @param {string|undefined} browser line for browser
   */
  emitLine(node, browser) {
    if (browser === undefined) {
      browser = node;
    }
    this.nodeOutput.push(node);
    this.browserOutput.push(browser);
  }

  /**
   * Process an import/export line
   * @param {string} line
   */
  transformImportExport(line) {
    const m = matchImportExport(line);
    if (!m) {
      return this.emitLine(line);
    }

    let { specifier } = m;
    if (isRelativeSpecifier(specifier)) {
      if (specifier.endsWith("_node")) {
        specifier = specifier.slice(0, -5); // trim "_node"
      }
      return this.emitLine(
        toImportExport({ ...m, specifier: `${specifier}_node.js` }),
        toImportExport({ ...m, specifier: `${specifier}_browser.js` }),
      );
    }

    const pkg = specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
    if (pkg.startsWith("node:")) {
      return this.emitLine(
        toImportExport({ ...m, specifier }),
        toImportExport({ ...m, specifier: specifier.slice(5) }), // trim "node:" in specifier
      );
    }
    if (!CJS_IMPORTS.has(pkg) || !m.from) {
      return this.emitLine(toImportExport(m));
    }

    const importVar = `_cjsDefaultImport${this.nCjsImports++}`;
    const [, defaultExport, namedExports] = /^\s*([^,{]+)?\s*,?\s*({[^}]+})?\s*$/.exec(m.imports);
    const importLines = [`import ${importVar} from "${specifier}";`];
    if (defaultExport) {
      importLines.push(`const ${defaultExport} = __importDefault(${importVar}).default;`);
    }
    if (namedExports) {
      importLines.push(`const ${namedExports.replaceAll(" as ", ": ")} = __importStar(${importVar});`);
    }
    return this.emitLine(importLines.join(" "));
  }
}

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
      delayedWrite(filename, false);
    } else if (filename.endsWith(".d.ts")) {
      await transformDeclaration(filename);
    } else if (filename.endsWith(".js")) {
      await new TransformJs(filename).execute();
    }
  } catch (err) {
    console.warn(filename, err);
  }
});
