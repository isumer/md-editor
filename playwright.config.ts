import { defineConfig } from "@playwright/test";

const junitOutputFile = process.env.PLAYWRIGHT_JUNIT_OUTPUT_FILE ?? "reports/e2e-junit.xml";

export default defineConfig({
  testDir: "test/e2e",
  timeout: 15_000,
  expect: {
    timeout: 2_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["junit", { outputFile: junitOutputFile }],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
