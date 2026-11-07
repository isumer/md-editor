import { describe, expect, it } from "vitest";

import {
  compareVersions,
  isNewerRelease,
  parseVersion,
} from "../../src/shared/update/updatePolicy";

describe("update version policy", () => {
  it("AC-R9-07: parses release, prerelease and build forms", () => {
    expect(parseVersion("1.2.3")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
    });
    expect(parseVersion("v999999.0.42-alpha.7-x")).toEqual({
      major: 999999,
      minor: 0,
      patch: 42,
      prerelease: ["alpha", "7-x"],
    });
    expect(parseVersion("1.2.3-rc.1+build.45-x")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: ["rc", "1"],
    });
  });

  it("AC-R9-07: rejects invalid version forms", () => {
    const invalid = [
      "",
      " ",
      "1.2",
      "1.2.3.4",
      "01.2.3",
      "1.02.3",
      "1.2.03",
      "1000000.2.3",
      "1.1000000.3",
      "1.2.1000000",
      "1.2.3-",
      "1.2.3-alpha..1",
      "1.2.3+",
      "1.2.3+build..1",
      "1.2.3 alpha",
      "V1.2.3",
      "1.2.3_1",
    ];

    for (const value of invalid) {
      expect(parseVersion(value), value).toBeNull();
    }
  });

  it("AC-R9-07: orders major, minor, patch and prerelease versions", () => {
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.3.0", "1.2.9")).toBe(1);
    expect(compareVersions("1.2.4", "1.2.3")).toBe(1);
    expect(compareVersions("1.0.0-alpha.10", "1.0.0-alpha.2")).toBe(1);
    expect(compareVersions("1.0.0-beta", "1.0.0-alpha")).toBe(1);
    expect(compareVersions("1.0.0-alpha.1", "1.0.0-alpha")).toBe(1);
    expect(isNewerRelease("1.2.4", "1.2.3")).toBe(true);
    expect(isNewerRelease("invalid", "1.2.3")).toBe(false);
  });

  it("AC-R9-07: compares numeric prerelease identifiers by value", () => {
    expect(compareVersions("1.0.0-01", "1.0.0-1")).toBe(0);
    expect(compareVersions("1.0.0-alpha.2", "1.0.0-alpha.3")).toBe(-1);
    expect(compareVersions("1.0.0-alpha.3", "1.0.0-alpha.2")).toBe(1);
  });

  it("AC-R9-07: releases beat prereleases and invalid versions do not compare", () => {
    expect(compareVersions("1.0.0", "1.0.0-rc.9")).toBe(1);
    expect(compareVersions("1.0.0-rc.9", "1.0.0")).toBe(-1);
    expect(compareVersions("v1.2.3+one", "1.2.3+two")).toBe(0);
    expect(compareVersions("bad", "1.2.3")).toBeNull();
    expect(compareVersions("1.2.3", "bad")).toBeNull();
  });
});
