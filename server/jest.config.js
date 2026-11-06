module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  verbose: true,
  // Gives each worker its own on-disk auth JSON file (UserRepository in
  // src/config/db.js) so parallel test files never race the same file.
  // See tests/helpers/isolateAuthDbFile.js for why this exists.
  setupFiles: ["<rootDir>/tests/helpers/isolateAuthDbFile.js"],
};
