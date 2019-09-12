module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  moduleFileExtensions: ['ts', 'js'],

  testRegex: '/tests/.*\\.(ts|js)',
  testPathIgnorePatterns: [
    '/node_modules/',
  ],

  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/lib/',
  ],
};
