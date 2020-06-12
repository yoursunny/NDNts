import { readFileSync } from "fs";
import { rollup } from "rollup";
import cleanup from 'rollup-plugin-cleanup';
import excludeDependenciesFromBundle from "rollup-plugin-exclude-dependencies-from-bundle";
import jscc from "rollup-plugin-jscc";

const pkg = JSON.parse(readFileSync("package.json"));
if (pkg.publishConfig) {
  Object.assign(pkg, pkg.publishConfig);
}
if (!pkg.module) {
  process.exit();
}
console.log(`${pkg.name} ${pkg.main} ${pkg.module}`);

rollup({
  input: pkg.main,
  plugins: [
    jscc({
      prefixes: ["/// "],
    }),
    excludeDependenciesFromBundle({ dependencies: true }),
    cleanup(),
  ],
}).then(bundle => bundle.write({
  file: pkg.module,
  format: "es",
  sourcemap: true,
  sourcemapExcludeSources: true,
})).catch(console.error);
