const { promises: fs } = require("graceful-fs");
const { pipeline } = require("stream");
const split2 = require("split2");

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
 * Transform a declaration file: delete source map.
 * @param {string} filename
 */
async function transformDeclaration(filename) {
  let lines = (await fs.readFile(filename, "utf-8")).split("\n");
  lines = lines.filter((l) => !l.startsWith("//# sourceMappingURL="));
  delayedWrite(filename, lines);
}

// Allowlist of packages published with ES Module entrypoint.
const ESM_IMPORTS = new Set([
  "graphql-request",
  "idb-keyval",
  "streaming-iterables",
  "ws",
  "yargs",
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
    const input = (await fs.readFile(this.filename, { encoding: "utf-8" })).split(/\r?\n/);
    for (const line of input) {
      switch (true) {
        case line.startsWith("import ") || line.startsWith("export "):
          this.transformImportExport(line);
          break;
        case line.startsWith("//# sourceMappingURL="):
          break;
        default:
          this.emitLine(line);
          break;
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
    const m = /^(import|export) (\* as )?(.*) from ["'](.*)["'];$/.exec(line);
    if (!m) {
      return this.emitLine(line);
    }

    let [, action, allAs = "", imports, specifier] = m;
    if (/^\.(?:[^/]*\/)*[^/.]+$/.test(specifier)) {
      if (specifier.endsWith("_node")) {
        specifier = specifier.slice(0, -5); // trim "_node"
      }
      return this.emitLine(
        `${action} ${allAs}${imports} from "${specifier}_node.js";`,
        `${action} ${allAs}${imports} from "${specifier}_browser.js";`,
      );
    }

    const pkg = specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
    if (pkg.startsWith("@ndn/") || ESM_IMPORTS.has(pkg)) {
      return this.emitLine(line);
    }
    if (pkg.startsWith("node:")) {
      const browserSpecifier = specifier.slice(5); // trim "node:"
      return this.emitLine(
        `${action} ${allAs}${imports} from "${specifier}";`,
        `${action} ${allAs}${imports} from "${browserSpecifier}";`,
      );
    }

    const importVar = `_cjsDefaultImport${this.nCjsImports++}`;
    const [, defaultExport, namedExports] = /^\s*([^,{]+)?\s*,?\s*({[^}]+})?\s*$/.exec(imports);
    const importLines = [`import ${importVar} from "${specifier}";`];
    if (defaultExport) {
      importLines.push(`const ${defaultExport} = __importDefault(${importVar}).default;`);
    }
    if (namedExports) {
      importLines.push(`const ${namedExports.replace(/ as /g, ": ")} = __importStar(${importVar});`);
    }
    return this.emitLine(importLines.join(" "));
  }
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
})();
