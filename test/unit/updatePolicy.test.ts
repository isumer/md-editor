import { describe, expect, it } from "vitest";

import {
  shouldCheckForUpdates,
  updateActionFor,
  type UpdateKind,
} from "../../src/shared/update/updatePolicy";

const DAY_MS = 24 * 60 * 60 * 1_000;

describe("update check policy", () => {
  it("AC-R9-08: checks without a prior check and at the 24 hour boundary", () => {
    expect(
      shouldCheckForUpdates({ enabled: true, lastCheckedAt: null, now: 0 }),
    ).toBe(true);
    expect(
      shouldCheckForUpdates({ enabled: true, lastCheckedAt: 1, now: DAY_MS + 1 }),
    ).toBe(true);
    expect(
      shouldCheckForUpdates({ enabled: true, lastCheckedAt: 0, now: DAY_MS }),
    ).toBe(true);
  });

  it("AC-R9-08: skips disabled, early and invalid clock states", () => {
    expect(
      shouldCheckForUpdates({ enabled: false, lastCheckedAt: null, now: 0 }),
    ).toBe(false);
    expect(
      shouldCheckForUpdates({ enabled: true, lastCheckedAt: 1, now: DAY_MS }),
    ).toBe(false);
    expect(
      shouldCheckForUpdates({ enabled: true, lastCheckedAt: null, now: NaN }),
    ).toBe(false);
    expect(
      shouldCheckForUpdates({ enabled: true, lastCheckedAt: null, now: -1 }),
    ).toBe(false);
    expect(
      shouldCheckForUpdates({ enabled: true, lastCheckedAt: -1, now: DAY_MS }),
    ).toBe(false);
    expect(
      shouldCheckForUpdates({ enabled: true, lastCheckedAt: null, now: Infinity }),
    ).toBe(false);
    expect(
      shouldCheckForUpdates({ enabled: true, lastCheckedAt: NaN, now: DAY_MS }),
    ).toBe(false);
    expect(
      shouldCheckForUpdates({
        enabled: true,
        lastCheckedAt: Infinity,
        now: DAY_MS,
      }),
    ).toBe(false);
  });

  it("AC-R9-10: maps each update kind to its action", () => {
    const cases: readonly [UpdateKind, "install" | "notify"][] = [
      ["installer", "install"],
      ["appimage", "install"],
      ["portable", "notify"],
      ["deb", "notify"],
      ["mac-unsigned", "notify"],
      ["mac-signed", "install"],
    ];

    for (const [kind, action] of cases) {
      expect(updateActionFor(kind, true)).toBe(action);
    }
  });

  it("AC-R9-10: returns none for every kind when no update exists", () => {
    const kinds: readonly UpdateKind[] = [
      "installer",
      "appimage",
      "portable",
      "deb",
      "mac-unsigned",
      "mac-signed",
    ];

    for (const kind of kinds) {
      expect(updateActionFor(kind, false)).toBe("none");
    }
  });
});
