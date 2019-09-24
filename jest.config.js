const path = require("path");

module.exports = {
  preset: 'ts-jest',
  testEnvironment: './mk/jest-env/node',

  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^@ndn/([^/]*)$': path.join(__dirname, "packages/$1/src"),
    '^@ndn/([^/]*)/test-fixture$': path.join(__dirname, "packages/$1/test-fixture"),
  },

  testRegex: '/tests/.*\\.t\\.ts',
  testPathIgnorePatterns: [
    '/node_modules/',
    '/integ/',
  ],

  coveragePathIgnorePatterns: [
    '/lib/',
    '/node_modules/',
    '/test-fixture/',
  ],

  globals: {
    'ts-jest': {
      packageJson: '<rootDir>/package.json',
    },
  },
};
