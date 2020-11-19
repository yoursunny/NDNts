const builtins = require("builtins")();
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
  ...builtins,
  "graphql-request",
  "streaming-iterables",
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
    const input = (await fs.readFile(this.filename, { encoding: "utf-8" })).split("\n");
    for (let line of input) {
      line = line.replace(/\r$/, "");
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
      this.nodeOutput.unshift(
        "import { __importDefault, __importStar } from \"tslib\";",
      );
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
    if (typeof browser === "undefined") {
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
    const m = line.match(/^(import|export) (\* as )?(.*) from ["'](.*)["'];$/);
    if (!m) {
      return this.emitLine(line);
    }

    let [, action, allAs = "", imports, specifier] = m;
    if (specifier.startsWith(".")) {
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

    const defaultImport = `_cjsDefaultImport${this.nCjsImports++}`;
    if (imports.startsWith("{")) {
      imports = imports.replace(/ as /g, ": ");
      return this.emitLine(
        `import ${defaultImport} from "${specifier}"; const ${imports} = __importStar(${defaultImport});`,
        line,
      );
    }
    return this.emitLine(
      `import ${defaultImport} from "${specifier}"; const ${imports} = __importDefault(${defaultImport}).default;`,
      line,
    );
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
      await fs.unlink(filename);
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
