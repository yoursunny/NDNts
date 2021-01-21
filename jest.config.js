const path = require("path");

/** @typedef {import('ts-jest')} */
/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: path.resolve(__dirname, "mk", "jest-env-node"),

  moduleFileExtensions: ["ts", "js"],
  moduleNameMapper: {
    "^@ndn/([^/]*)$": path.join(__dirname, "packages/$1"),
    "^@ndn/([^/]*)/test-fixture$": path.join(__dirname, "packages/$1/test-fixture"),
  },

  testRegex: "/tests/.*\\.t\\.ts",
  testPathIgnorePatterns: [
    "/node_modules/",
    "/integ/",
  ],

  coveragePathIgnorePatterns: [
    "/lib/",
    "/node_modules/",
    "/test-fixture/",
  ],

  globals: {
    "ts-jest": {},
  },
};
