module.exports = {
  env: {
    es2020: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
  ],
  rules: {
    "comma-dangle": ["error", "always-multiline"],
    "no-console": "warn",
    "no-empty": ["error", { allowEmptyCatch: true }],
    "quotes": ["error", "double", { allowTemplateLiterals: true }],
  },
};
