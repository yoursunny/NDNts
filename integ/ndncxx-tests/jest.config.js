const parent = require("../../jest.config.js");

const config = {
  ...parent,
  testPathIgnorePatterns: parent.testPathIgnorePatterns.filter(x => !/integ/.test(x)),
};

module.exports = config;
