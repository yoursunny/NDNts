import { register } from "node:module";
import path from "node:path";

process.env.TS_CONFIG_PATH = path.resolve(import.meta.dirname, "tsconfig-literate.json");
register(new URL("loader.mjs", import.meta.url));
