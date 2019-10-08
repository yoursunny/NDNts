const parent = require("../../jest.config.js");
const puppeteerPreset = require("jest-puppeteer/jest-preset.json");

const config = {
  ...parent,
  ...puppeteerPreset,
  testPathIgnorePatterns: parent.testPathIgnorePatterns.filter(x => !/integ/.test(x)),
};

module.exports = config;
