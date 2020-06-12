const path = require("path");
const parent = require("../../jest.config.js");

const config = {
  ...parent,

  globalSetup: "jest-environment-puppeteer/setup",
  globalTeardown: "jest-environment-puppeteer/teardown",
  testEnvironment: path.resolve(__dirname, "jest-env-puppeteer"),
  setupFilesAfterEnv: ["expect-puppeteer"],

  testPathIgnorePatterns: parent.testPathIgnorePatterns.filter((x) => !/integ/.test(x)),
};

module.exports = config;
