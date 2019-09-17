module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^@ndn/([^/]*)$': '<rootDir>/packages/$1/src',
    '^@ndn/([^/]*)/test-fixture$': '<rootDir>/packages/$1/test-fixture',
  },

  testRegex: '/tests/.*\\.t\\.ts',
  testPathIgnorePatterns: [
    '/node_modules/',
  ],

  coveragePathIgnorePatterns: [
    '/lib/',
    '/node_modules/',
    '/test-fixture/',
  ],
};
