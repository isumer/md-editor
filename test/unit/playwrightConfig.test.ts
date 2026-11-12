import { afterEach, describe, expect, it, vi } from "vitest";

const skipPerfVariable = ["SOLIDMD", "SKIP", "PERF"].join("_");
const previousSkip = process.env[skipPerfVariable];
const previousJunitOutput = process.env.PLAYWRIGHT_JUNIT_OUTPUT_FILE;

afterEach(() => {
  if (previousSkip === undefined) delete process.env[skipPerfVariable];
  else process.env[skipPerfVariable] = previousSkip;
  if (previousJunitOutput === undefined) delete process.env.PLAYWRIGHT_JUNIT_OUTPUT_FILE;
  else process.env.PLAYWRIGHT_JUNIT_OUTPUT_FILE = previousJunitOutput;
  vi.resetModules();
});

describe("Playwright configuration", () => {
  it("includes perf criteria when the temporary perf skip is on", async () => {
    process.env[skipPerfVariable] = "1";
    vi.resetModules();

    const { default: config } = await import("../../playwright.config");

    expect(config.grepInvert).toBeUndefined();
  });

  it("writes JUnit to the path selected for a split test run", async () => {
    process.env.PLAYWRIGHT_JUNIT_OUTPUT_FILE = "reports/perf-e2e-junit.xml";
    vi.resetModules();

    const { default: config } = await import("../../playwright.config");

    expect(config.reporter).toContainEqual([
      "junit",
      { outputFile: "reports/perf-e2e-junit.xml" },
    ]);
  });
});
