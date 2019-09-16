module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  moduleFileExtensions: ['ts', 'js'],

  testRegex: '/tests/.*\\.t\\.ts',
  testPathIgnorePatterns: [
    '/node_modules/',
  ],

  coveragePathIgnorePatterns: [
    '/lib/',
    '/node_modules/',
    '/src/expect/',
  ],
};
