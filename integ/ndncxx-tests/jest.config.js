const parent = require("../../jest.config.js");

const config = Object.assign({}, parent);
config.testPathIgnorePatterns = config.testPathIgnorePatterns.filter(x => !/integ/.test(x));

module.exports = config;
