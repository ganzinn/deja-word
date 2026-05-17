import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.unit.test.ts"],
          setupFiles: ["./tests/setup/unit.setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.integration.test.ts"],
          setupFiles: ["./tests/setup/integration.setup.ts"],
          globalSetup: ["./tests/setup/integration.global-setup.ts"],
          fileParallelism: false,
          hookTimeout: 60_000,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
