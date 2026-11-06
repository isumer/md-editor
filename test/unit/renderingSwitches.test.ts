import { describe, expect, it, vi } from "vitest";

import { applyRenderingSwitches } from "../../src/main/app/renderingSwitches";

function fakeCommandLine() {
  return { appendSwitch: vi.fn<(name: string, value?: string) => void>() };
}

describe("rendering switches", () => {
  it("AC-PERF-09: turns Skia Graphite off on macOS", () => {
    const commandLine = fakeCommandLine();

    applyRenderingSwitches(commandLine, "darwin");

    expect(commandLine.appendSwitch).toHaveBeenCalledWith("disable-features", "SkiaGraphite");
  });

  it.each(["linux", "win32"] as const)(
    "AC-PERF-09: leaves the Chromium rendering backend alone on %s",
    (platform) => {
      const commandLine = fakeCommandLine();

      applyRenderingSwitches(commandLine, platform);

      expect(commandLine.appendSwitch).not.toHaveBeenCalled();
    },
  );
});
