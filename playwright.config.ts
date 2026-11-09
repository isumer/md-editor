import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test/e2e",
  // Temporary owner order 2026-11-08. Remove with the perf fix.
  ...(process.env.MDEDITOR_SKIP_PERF === "1" ? { grepInvert: /@AC-PERF/ } : {}),
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
    ["junit", { outputFile: "reports/e2e-junit.xml" }],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
