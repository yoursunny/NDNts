const parent = require("../../jest.config.js");

const config = {
  ...parent,
  maxWorkers: 1,

  testPathIgnorePatterns: parent.testPathIgnorePatterns.filter((x) => !/integ/.test(x)),
};

module.exports = config;
