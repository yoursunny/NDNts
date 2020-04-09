const tsRc = require("./eslintrc-ts");

module.exports = {
  ...tsRc,
  rules: {
    ...tsRc.rules,
    "@typescript-eslint/no-unsafe-call": "off",
    "simple-import-sort/sort": "off",
    "padded-blocks": "off",
  },
};
