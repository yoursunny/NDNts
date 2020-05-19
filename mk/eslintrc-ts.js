const path = require("path");
const jsRc = require("./eslintrc-js");

module.exports = {
  extends: [
    ...jsRc.extends,
    "xo-typescript",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: path.resolve(__dirname, "..", "tsconfig.json"),
  },
  plugins: [
    "@typescript-eslint",
    ...jsRc.plugins,
  ],
  env: {
    ...jsRc.env,
  },
  globals: {
    ...jsRc.globals,
  },
  rules: {
    ...jsRc.rules,
    "@typescript-eslint/ban-types": "off",
    "@typescript-eslint/brace-style": jsRc.rules["brace-style"],
    "@typescript-eslint/class-literal-property-style": ["error", "fields"],
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/indent": jsRc.rules.indent,
    "@typescript-eslint/member-ordering": "off",
    "@typescript-eslint/no-base-to-string": "off",
    "@typescript-eslint/no-invalid-void-type": "off", // https://github.com/typescript-eslint/typescript-eslint/issues/2044
    "@typescript-eslint/no-unnecessary-qualifier": "off",
    "@typescript-eslint/no-unsafe-member-access": "off",
    "@typescript-eslint/no-unsafe-return": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/promise-function-async": "off",
    "@typescript-eslint/prefer-readonly": "off",
    "@typescript-eslint/prefer-readonly-parameter-types": "off",
    "@typescript-eslint/quotes": jsRc.rules.quotes,
    "@typescript-eslint/restrict-template-expressions": "off",
    "@typescript-eslint/switch-exhaustiveness-check": "off",
    "@typescript-eslint/unified-signatures": "off",
    "brace-style": "off",
    indent: "off",
    quotes: "off",
    "no-return-await": "off",
  },
};
