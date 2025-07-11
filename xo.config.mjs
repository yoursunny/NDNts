import { js, literate, pptr, ts, web } from "@yoursunny/xo-config";

/** @type {import("xo").FlatXoConfig} */
const config = [
  js,
  {
    files: ["**/*.{ts,cts,mts}"],
    ...ts,
  },
  {
    files: ["**/test-fixture/**", "**/tests/**", "integ/**"],
    rules: {
      "import-x/no-extraneous-dependencies": ["error", { whitelist: ["vitest"] }],
      "n/no-extraneous-import": "off",
    },
  },
  {
    files: [
      "**/*_browser.*",
      "pkg/quic-transport/**",
      "pkg/web-bluetooth-transport/**",
      "pkg/ws-transport/**",
      "integ/browser-tests/**/*.{ts,cts,mts}",
    ],
    ...web,
  },
  {
    files: [
      "integ/browser-tests/**/*.{ts,cts,mts}",
    ],
    ...pptr,
  },
  {
    files: [
      "**/README.md.ts",
    ],
    ...literate,
  },
];

export default config;
