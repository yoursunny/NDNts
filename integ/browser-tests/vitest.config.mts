import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { target: "es2022" },
  test: {
    deps: {
      interopDefault: true,
    },
    include: [
      "tests/**/*.t.ts",
    ],
    watch: false,
    testTimeout: 30000,
    globalSetup: "./setup-webpack.mts",
  },
});
