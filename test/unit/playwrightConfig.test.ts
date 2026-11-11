import { afterEach, describe, expect, it, vi } from "vitest";

const skipPerfVariable = ["SOLIDMD", "SKIP", "PERF"].join("_");
const previousSkip = process.env[skipPerfVariable];

afterEach(() => {
  if (previousSkip === undefined) delete process.env[skipPerfVariable];
  else process.env[skipPerfVariable] = previousSkip;
  vi.resetModules();
});

describe("Playwright configuration", () => {
  it("includes perf criteria when the temporary perf skip is on", async () => {
    process.env[skipPerfVariable] = "1";
    vi.resetModules();

    const { default: config } = await import("../../playwright.config");

    expect(config.grepInvert).toBeUndefined();
  });
});
