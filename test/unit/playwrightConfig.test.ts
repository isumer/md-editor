import { afterEach, describe, expect, it, vi } from "vitest";

const previousSkip = process.env.MDEDITOR_SKIP_PERF;

afterEach(() => {
  if (previousSkip === undefined) delete process.env.MDEDITOR_SKIP_PERF;
  else process.env.MDEDITOR_SKIP_PERF = previousSkip;
  vi.resetModules();
});

describe("Playwright configuration", () => {
  it("excludes perf criteria when the temporary perf skip is on", async () => {
    process.env.MDEDITOR_SKIP_PERF = "1";
    vi.resetModules();

    const { default: config } = await import("../../playwright.config");
    const grepInvert = config.grepInvert;

    expect(grepInvert).toBeInstanceOf(RegExp);
    if (!(grepInvert instanceof RegExp)) throw new Error("grepInvert must be a RegExp");
    expect(grepInvert.test("@AC-PERF-09")).toBe(true);
  });

  it("includes perf criteria when the temporary perf skip is off", async () => {
    delete process.env.MDEDITOR_SKIP_PERF;
    vi.resetModules();

    const { default: config } = await import("../../playwright.config");

    expect(config.grepInvert).toBeUndefined();
  });
});
