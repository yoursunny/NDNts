const parent = require("../../jest.config.js");
const puppeteerPreset = require("jest-puppeteer/jest-preset.json");

const config = Object.assign({}, parent, puppeteerPreset);
config.testPathIgnorePatterns = config.testPathIgnorePatterns.filter(x => !/integ/.test(x));

module.exports = config;
