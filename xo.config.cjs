/** @typedef {import("xo").Options} XoOptions */

/** @type {import("@yoursunny/xo-config")} */
const { js, ts, literate, web, pptr, merge } = require("@yoursunny/xo-config");

/**
 * @param {string[]} pkgs
 * @param {XoOptions} config
 * @returns {XoOptions[]}
 */
function makePackageOverrides(config, ...pkgs) {
  return [
    {
      files: [
        pkgs.map((pkg) => `**${pkg}/**/*.{ts,cts,mts}`),
      ],
      ...config,
    },
    {
      files: [
        pkgs.map((pkg) => `**${pkg}/**/*_browser.{ts,cts,mts}`),
      ],
      ...merge(config, web),
    },
    {
      files: [
        pkgs.flatMap((pkg) => [`**${pkg}/test-fixture/**/*.{ts,cts,mts}`, `**${pkg}/tests/**/*.{ts,cts,mts}`]),
      ],
      ...merge(config, {
        rules: {
          "import/no-extraneous-dependencies": "off",
        },
      }),
    },
  ];
}

/** @type {XoOptions} */
const tsdoc = {
  plugins: ["tsdoc"],
  rules: {
    "tsdoc/syntax": "warn",
  },
};

/** @type {XoOptions} */
module.exports = {
  ...js,
  overrides: [
    ...makePackageOverrides(merge(js, ts), ""),
    ...makePackageOverrides(merge(js, ts, tsdoc),
      "/packages/*mgmt",
      "/packages/cli-common",
      "/packages/endpoint",
      "/packages/fw",
      "/packages/keychain",
      "/packages/l3face",
      "/packages/lp",
      "/packages/nac",
      "/packages/naming-convention*",
      "/packages/ndn",
      "/packages/ndncert",
      "/packages/ndnsec",
      "/packages/node-transport",
      "/packages/packet",
      "/packages/repo*",
      "/packages/segmented-object",
      "/packages/tlv",
      "/packages/util",
    ),
    ...makePackageOverrides(merge(js, ts, tsdoc, web),
      "/packages/quic-transport",
      "/packages/web-bluetooth-transport",
      "/packages/ws-transport",
    ),
    {
      files: [
        "**/integ/browser-tests/**/*.{ts,cts,mts}",
      ],
      ...merge(js, ts, web, pptr),
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
