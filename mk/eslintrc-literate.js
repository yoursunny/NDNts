const tsRc = require("./eslintrc-ts");

module.exports = {
  ...tsRc,
  rules: {
    ...tsRc.rules,
    "simple-import-sort/sort": "off",
    "padded-blocks": "off",
  },
};
