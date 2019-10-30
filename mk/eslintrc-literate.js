const tsRc = require("./eslintrc-ts");

module.exports = {
  ...tsRc,
  rules: {
    ...tsRc.rules,
    "no-console": "off",
  },
};
