module.exports = {
  plugins: [
    "simple-import-sort",
  ],
  env: {
    es2020: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
  ],
  rules: {
    "simple-import-sort/sort": "error",
    "comma-dangle": ["error", "always-multiline"],
    "no-console": "warn",
    "no-empty": ["error", { allowEmptyCatch: true }],
    "quotes": ["error", "double", { allowTemplateLiterals: true }],
  },
};
