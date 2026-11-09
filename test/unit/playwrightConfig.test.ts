import { afterEach, describe, expect, it, vi } from "vitest";

const previousSkip = process.env.MDEDITOR_SKIP_PERF;

afterEach(() => {
  if (previousSkip === undefined) delete process.env.MDEDITOR_SKIP_PERF;
  else process.env.MDEDITOR_SKIP_PERF = previousSkip;
  vi.resetModules();
});

describe("Playwright configuration", () => {
  it("includes perf criteria when the temporary perf skip is on", async () => {
    process.env.MDEDITOR_SKIP_PERF = "1";
    vi.resetModules();

    const { default: config } = await import("../../playwright.config");

    expect(config.grepInvert).toBeUndefined();
  });
});
