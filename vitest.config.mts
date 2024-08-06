import { defineConfig } from "vitest/config";
import type { CoverageOptions } from "vitest/node";

const coverage: CoverageOptions<"v8"> = {
  provider: "v8",
  reporter: process.env.CI ? ["lcovonly"] : ["html", "text-summary"],
  include: ["pkg/**/src/**/*.ts"],
  all: false,
};

if (process.env.COVERPKG) {
  coverage.include = [`${process.env.COVERPKG}/src/**/*.ts`];
  coverage.all = true;
}

export default defineConfig({
  esbuild: { target: "es2022" },
  test: {
    coverage,
    deps: {
      interopDefault: true,
    },
    include: [
      "pkg/**/tests/**/*.t.ts",
    ],
    teardownTimeout: 30000,
    watch: false,
  },
});
