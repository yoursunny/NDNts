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
    "array-bracket-spacing": ["error", "never"],
    "block-spacing": "error",
    "comma-dangle": ["error", "always-multiline"],
    "comma-spacing": "error",
    "comma-style": "error",
    "computed-property-spacing": ["error", "never", { enforceForClassMembers: true }],
    "func-call-spacing": "error",
    "key-spacing": "error",
    "no-console": "warn",
    "no-empty": ["error", { allowEmptyCatch: true }],
    "object-curly-spacing": ["error", "always"],
    "quotes": ["error", "double", { allowTemplateLiterals: true }],
    "semi-spacing": "error",
    "switch-colon-spacing": "error",
  },
};
