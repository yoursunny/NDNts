/** @typedef {import("xo").Options} XoOptions */

/** @type {XoOptions} */
const js = {
  envs: ["es2020"],
  space: 2,
  plugins: [
    "simple-import-sort",
  ],
  extends: [
    "xo/esnext",
  ],
  rules: {
    "import/extensions": "off",
    "import/no-mutable-exports": "off",
    "promise/param-names": "off",
    "simple-import-sort/sort": "error",
    "unicorn/catch-error-name": ["error", { name: "err", caughtErrorsIgnorePattern: "^err" }],
    "unicorn/consistent-function-scoping": "off",
    "unicorn/no-fn-reference-in-iterator": "off",
    "unicorn/no-nested-ternary": "off",
    "unicorn/prefer-spread": "off",
    "unicorn/prefer-type-error": "off",
    "unicorn/prevent-abbreviations": "off",
    "array-element-newline": "off",
    "arrow-parens": ["error", "always"],
    "brace-style": ["error", "1tbs", { allowSingleLine: true }],
    "capitalized-comments": "off",
    "comma-dangle": ["error", "always-multiline"],
    "constructor-super": "off",
    "default-case": "off",
    "function-call-argument-newline": "off",
    "generator-star-spacing": ["error", { named: "after", anonymous: "neither", method: "before" }],
    indent: ["error", 2, {
      SwitchCase: 1,
      VariableDeclarator: "first",
      outerIIFEBody: 0,
      FunctionDeclaration: { parameters: 2 },
      FunctionExpression: { parameters: 2 },
      flatTernaryExpressions: true,
    }],
    "max-params": "off",
    "max-statements-per-line": ["error", { max: 3 }],
    "new-cap": "off",
    "no-await-in-loop": "off",
    "no-implicit-coercion": ["error", { allow: ["!!"] }],
    "no-inner-declarations": "off",
    "no-mixed-operators": "off",
    "no-return-assign": "off",
    "no-warning-comments": "off",
    "object-curly-spacing": ["error", "always"],
    "padded-blocks": ["error", "never", { allowSingleLineBlocks: true }],
    "padding-line-between-statements": "off",
    "prefer-destructuring": "off",
    "prefer-template": "error",
    quotes: ["error", "double"],
    "yield-star-spacing": ["error", "after"],
  },
};

/** @type {XoOptions} */
const ts = {
  extends: [
    "xo-typescript",
  ],
  rules: {
    "@typescript-eslint/ban-types": "off",
    "@typescript-eslint/brace-style": js.rules["brace-style"],
    "@typescript-eslint/class-literal-property-style": ["error", "fields"],
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/indent": js.rules.indent,
    "@typescript-eslint/member-ordering": "off",
    "@typescript-eslint/no-base-to-string": "off",
    "@typescript-eslint/no-unnecessary-qualifier": "off",
    "@typescript-eslint/no-unsafe-member-access": "off",
    "@typescript-eslint/no-unsafe-return": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/promise-function-async": "off",
    "@typescript-eslint/prefer-readonly": "off",
    "@typescript-eslint/prefer-readonly-parameter-types": "off",
    "@typescript-eslint/quotes": js.rules.quotes,
    "@typescript-eslint/restrict-template-expressions": "off",
    "@typescript-eslint/switch-exhaustiveness-check": "off",
    "@typescript-eslint/unified-signatures": "off",
    "import/export": "off",
    "import/no-unassigned-import": "off",
    "brace-style": "off",
    indent: "off",
    "no-redeclare": "off",
    "no-return-await": "off",
    "no-unused-vars": "off",
    "no-useless-constructor": "off",
    quotes: "off",
  },
};

/** @type {XoOptions} */
const jest = {
  extends: [
    "plugin:jest/recommended",
  ],
  rules: {
    "@typescript-eslint/no-invalid-void-type": "off",
    "import/no-extraneous-dependencies": "off",
    "jest/expect-expect": "off",
    "jest/no-standalone-expect": "off",
  },
};

/** @type {XoOptions} */
const web = {
  envs: ["browser"],
  globals: [
    "WebSocket",
  ],
};

/** @type {XoOptions} */
const pptr = {
  globals: [
    "browser",
    "context",
    "page",
    "jestPuppeteer",
  ],
};

/** @type {XoOptions} */
const literate = {
  rules: {
    "@typescript-eslint/no-unsafe-call": "off",
    "simple-import-sort/sort": "off",
    "unicorn/filename-case": "off",
    "padded-blocks": "off",
  },
};

function merge(base, ...patches) {
  const res = { ...base };
  for (const patch of patches) {
    for (const [key, value] of Object.entries(patch)) {
      if (Array.isArray(res[key])) {
        res[key] = [...res[key], ...value];
      } else if (typeof res[key] === "object") {
        res[key] = { ...res[key], ...value };
      } else {
        res[key] = value;
      }
    }
  }
  return res;
}

/**
 * @param {string[]} pkgs
 * @param {object} config
 */
function makePackageOverrides(config, ...pkgs) {
  return [
    {
      files: [
        pkgs.map((pkg) => `**${pkg}/**/*.ts`),
      ],
      ...config,
    },
    {
      files: [
        pkgs.flatMap((pkg) => [`**${pkg}/test-fixture/**/*.ts`, `**${pkg}/tests/**/*.ts`]),
      ],
      ...merge(config, jest),
    },
  ];
}

/** @type {XoOptions} */
module.exports = {
  ...js,
  overrides: [
    ...makePackageOverrides(merge(js, ts), ""),
    ...makePackageOverrides(merge(js, ts, web),
      "/packages/web-bluetooth-transport",
      "/packages/ws-transport",
    ),
    {
      files: [
        "**/integ/browser-tests/**/*.ts",
      ],
      ...merge(js, ts, web, jest, pptr),
    },
    {
      files: [
        "**/README.md.ts",
      ],
      ...merge(js, ts, literate),
    },
  ],
};
