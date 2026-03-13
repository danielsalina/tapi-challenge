/** @type {import('jest').Config} */
export default {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  collectCoverageFrom: ["src/**/*.ts"],
  coverageThreshold: {
    global: {
      branches: 65,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testEnvironmentOptions: {
    NODE_ENV: "test",
  },
  globals: {
    "ts-jest": {
      isolatedModules: true,
    },
  },
  // Variables de entorno requeridas para tests
  setupFiles: ["<rootDir>/tests/unit/setupEnv.ts"],
}
