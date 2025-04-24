module.exports = {
  testEnvironment: "node",
  testMatch: ["**/nodes/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": "ts-jest"
  },
  moduleFileExtensions: ["ts", "js", "json"]
};
