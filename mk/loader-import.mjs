import { register } from "node:module";
import { fileURLToPath } from "node:url";

process.env.TS_CONFIG_PATH = fileURLToPath(new URL("tsconfig-literate.json", import.meta.url));
register(new URL("loader.mjs", import.meta.url));
