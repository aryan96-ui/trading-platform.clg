// jest.config.js
module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    modulePathIgnorePatterns: ['<rootDir>/.freebuff', '<rootDir>/.vscode'],
    testTimeout: 10000
};
