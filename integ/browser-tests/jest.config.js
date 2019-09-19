const parent = require("../../jest.config.js");

module.exports = Object.assign({}, parent, {
  testEnvironment: "jest-environment-selenium",
  setupFilesAfterEnv: [
    "jest-environment-selenium/dist/setup.js",
  ],

  testRegex: '.*\\.t\\.ts',
});
