import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveWindowIcon } from "../../src/main/app/windowIcon";

describe("main window icon", () => {
  it("uses the 512 px PNG in the repository before packaging on Linux and Windows", () => {
    for (const platform of ["linux", "win32"] as const) {
      expect(resolveWindowIcon(platform, false, "/app", "/resources")).toBe(
        path.join("/app", "build", "icons", "512x512.png"),
      );
    }
  });

  it("uses the packaged window icon on Linux and Windows", () => {
    for (const platform of ["linux", "win32"] as const) {
      expect(resolveWindowIcon(platform, true, "/app", "/resources")).toBe(
        path.join("/resources", "window-icon.png"),
      );
    }
  });

  it("leaves the window icon to the bundle on macOS", () => {
    expect(resolveWindowIcon("darwin", false, "/app", "/resources")).toBeUndefined();
    expect(resolveWindowIcon("darwin", true, "/app", "/resources")).toBeUndefined();
  });
});
