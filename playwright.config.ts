import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test/e2e",
  timeout: 15_000,
  expect: {
    timeout: 2_000,
  },
  fullyParallel: false,
  workers: 1,
});
