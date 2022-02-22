/** @typedef {import("xo").Options} XoOptions */

/** @type {import("@yoursunny/xo-config")} */
const { js, ts: ts0, jest, literate, web, pptr, merge } = require("@yoursunny/xo-config");

const ts = merge(ts0, {
  rules: {
    "@typescript-eslint/naming-convention": "off",
    "@typescript-eslint/padding-line-between-statements": "off",
    "no-bitwise": "off",
    "no-constant-condition": ["error", { checkLoops: false }],
    "no-lone-blocks": "off",
  },
});

/**
 * @param {string[]} pkgs
 * @param {XoOptions} config
 * @returns {XoOptions[]}
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
        pkgs.map((pkg) => `**${pkg}/**/*_browser.ts`),
      ],
      ...merge(config, web),
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
      ...merge(js, ts, literate, {
        rules: {
          "unicorn/no-process-exit": "off",
        },
      }),
    },
  ],
};
