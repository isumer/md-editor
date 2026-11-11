import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  resolveDataDirectory,
  resolveExecutableDirectory,
} from "../../src/main/app/startup";

describe("portable data directory", () => {
  it("AC-R9-01: uses the portable data directory when the marker exists and it is writable", () => {
    expect(resolveDataDirectory({
      exeDir: path.join("root", "portable"),
      markerExists: true,
      isWritable: true,
      defaultUserData: path.join("profiles", "default"),
    })).toEqual({
      path: path.join("root", "portable", "data"),
      portable: true,
    });
  });

  it("AC-R9-02: falls back with a notice when the portable directory is not writable", () => {
    expect(resolveDataDirectory({
      exeDir: path.join("root", "portable"),
      markerExists: true,
      isWritable: false,
      defaultUserData: path.join("profiles", "default"),
    })).toEqual({
      path: path.join("profiles", "default"),
      portable: false,
      notice: "Portable data is not writable; using the default profile.",
    });
  });

  it("AC-R9-01: uses the default profile when there is no portable marker", () => {
    expect(resolveDataDirectory({
      exeDir: path.join("root", "installed"),
      markerExists: false,
      isWritable: true,
      defaultUserData: path.join("profiles", "default"),
    })).toEqual({
      path: path.join("profiles", "default"),
      portable: false,
    });
  });

  it("AC-R9-01: resolves AppImage portable data beside the AppImage", () => {
    const exeDir = resolveExecutableDirectory(
      path.join("tmp", ".mount_SolidMD", "solidmd"),
      path.join("media", "SolidMD.AppImage"),
    );

    expect(resolveDataDirectory({
      exeDir,
      markerExists: true,
      isWritable: true,
      defaultUserData: path.join("profiles", "default"),
    }).path).toBe(path.join("media", "data"));
  });
});
