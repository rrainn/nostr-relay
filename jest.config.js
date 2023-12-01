module.exports = {
	"preset": "ts-jest",
	"testEnvironment": "node",
	"testMatch": ["**/src/**/*.test.[jt]s?(x)"],
	"testPathIgnorePatterns": ["/node_modules/", "/dist/"],
	"coverageReporters": ["json", "lcov", "text", "html"],
	"transformIgnorePatterns": ["dist/.+\\.js"]
};
