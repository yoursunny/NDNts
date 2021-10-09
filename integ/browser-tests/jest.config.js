const path = require("path");
const parent = require("../../jest.config.js");

/** @type {import("@jest/types").Config.InitialOptions} */
module.exports = {
  ...parent,
  maxWorkers: 1,

  globalSetup: "jest-environment-puppeteer/setup",
  globalTeardown: "jest-environment-puppeteer/teardown",
  testEnvironment: path.resolve(__dirname, "jest-env-puppeteer"),
  setupFilesAfterEnv: ["expect-puppeteer"],

  testPathIgnorePatterns: parent.testPathIgnorePatterns.filter((x) => !x.includes("integ")),
};
