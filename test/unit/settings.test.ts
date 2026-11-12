import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  isSettingsReadRequest,
  isSettingsWriteRequest,
  SETTINGS_CHANNELS,
} from "../../src/shared/ipc/settings";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  parseSettings,
  serializeSettings,
} from "../../src/shared/settings/settings";

function fixture(name: string): string {
  return readFileSync(
    new URL(`../fixtures/settings/${name}`, import.meta.url),
    "utf8",
  );
}

describe("AC-R08-01: settings load, migrate and save", () => {
  it("AC-R08-01: loads every value from the complete fixture", () => {
    const settings = parseSettings(fixture("complete.json"));

    expect(settings.version).toBe(1);
    expect(settings.theme).toBe("system");
    expect(settings.fontSize).toBe(14);
    expect(settings.preview.scrollSync).toBe(true);
    expect(settings.editor.wrap).toBe(true);
    expect(settings.editor.tabSize).toBe(2);
    expect(settings.encoding.default).toBe("utf-8");
    expect(settings.encoding.lineEndings).toBe("lf");
    expect(settings.updates).toEqual({ enabled: true, lastCheckedAt: null });
    expect(settings.ignore).toEqual(["node_modules", ".git"]);
  });

  it("AC-R08-01: fills defaults for a partial file", () => {
    const settings = parseSettings(fixture("partial.json"));

    expect(settings.theme).toBe("dark");
    expect(settings).toEqual({ ...DEFAULT_SETTINGS, theme: "dark" });
  });

  it("AC-R08-01: keeps unknown keys", () => {
    const settings = parseSettings(fixture("unknown-keys.json"));

    expect(settings["futureOption"]).toEqual({ density: "compact" });
    expect(settings["futureFlag"]).toBe(true);
    expect(parseSettings(serializeSettings(settings))).toEqual(settings);
  });

  it("AC-R08-01: migrates version 0", () => {
    const settings = parseSettings(fixture("version-old.json"));

    expect(settings.editor.tabSize).toBe(2);
    expect(settings.version).toBe(1);

    const migrated = normalizeSettings({ version: 0, editor: { tabWidth: 8 } });
    expect(migrated.editor.tabSize).toBe(8);

    const withoutTabWidth = normalizeSettings({
      version: 0,
      editor: { wrap: false },
    });
    expect(withoutTabWidth.editor).toEqual({ wrap: false, tabSize: 2, background: null });
  });

  it("AC-R08-01: migrates tabWidth when the version is missing", () => {
    const settings = normalizeSettings({ editor: { tabWidth: 6 } });

    expect(settings.version).toBe(1);
    expect(settings.editor).toEqual({ wrap: true, tabSize: 6, background: null });
  });

  it("AC-R08-01: keeps tabSize when an old file has no tabWidth", () => {
    const settings = normalizeSettings({ version: 0, editor: { tabSize: 5 } });

    expect(settings.editor.tabSize).toBe(5);
  });

  it("AC-R08-01: ignores tabWidth when the file is already version 1", () => {
    const settings = normalizeSettings({
      version: 1,
      editor: { tabWidth: 6, tabSize: 3 },
    });

    expect(settings.editor).toEqual({ wrap: true, tabSize: 3, background: null });
  });

  it("AC-R08-01: keeps an unknown __proto__ key without changing the prototype", () => {
    const raw = '{"version":1,"__proto__":{"polluted":true}}';
    const settings = parseSettings(raw);

    expect(Object.hasOwn(settings, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(settings)).toBe(Object.prototype);
    expect((settings as { polluted?: boolean }).polluted).toBeUndefined();
    expect(parseSettings(serializeSettings(settings))).toEqual(settings);
  });

  it("AC-R08-01: returns defaults for a corrupt file", () => {
    for (const name of ["corrupt-truncated.json", "empty.json"]) {
      expect(parseSettings(fixture(name))).toEqual(DEFAULT_SETTINGS);
    }
  });

  it("AC-R08-01: rejects an array", () => {
    expect(parseSettings(fixture("corrupt-array.json"))).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it("AC-R08-01: round-trips a saved file", () => {
    const settings = parseSettings(fixture("complete.json"));

    expect(parseSettings(serializeSettings(settings))).toEqual(settings);
  });

  it("AC-R08-01: gives each known key its default when the type is wrong", () => {
    const settings = normalizeSettings({
      version: 1,
      theme: "sepia",
      fontSize: "14",
      preview: { scrollSync: "yes" },
      editor: { wrap: "yes", tabSize: "2" },
      encoding: { default: "latin1", lineEndings: "mixed" },
      updates: { enabled: "yes", lastCheckedAt: "yesterday" },
      ignore: ["node_modules", 7],
    });

    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it("AC-R08-01: gives defaults when a nested object is not an object", () => {
    const settings = normalizeSettings({
      version: 1,
      preview: "off",
      editor: [],
      encoding: 42,
    });

    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it("AC-R08-01: gives defaults for an unsupported version", () => {
    const settings = normalizeSettings({ version: 2, theme: "dark" });

    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it("AC-R08-01: gives defaults for values that are not objects", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("text")).toEqual(DEFAULT_SETTINGS);
  });

  it("AC-R08-01: keeps every allowed theme and line ending", () => {
    for (const theme of ["light", "dark", "system"] as const) {
      expect(normalizeSettings({ version: 1, theme }).theme).toBe(theme);
    }

    for (const lineEndings of ["lf", "crlf", "cr"] as const) {
      const settings = normalizeSettings({
        version: 1,
        encoding: { lineEndings },
      });
      expect(settings.encoding.lineEndings).toBe(lineEndings);
    }
  });

  it("preserves stored editor and preview backgrounds", () => {
    const settings = normalizeSettings({
      version: 1,
      preview: { background: "#123456" },
      editor: { background: "#abcdef" },
    });

    expect(settings.preview.background).toBe("#123456");
    expect(settings.editor.background).toBe("#abcdef");
  });

  it("AC-R9-08: preserves valid update check settings", () => {
    expect(normalizeSettings({
      version: 1,
      updates: { enabled: false, lastCheckedAt: 42 },
    }).updates).toEqual({ enabled: false, lastCheckedAt: 42 });
  });

  it("AC-R9-08: rejects invalid update check timestamps", () => {
    for (const lastCheckedAt of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(normalizeSettings({
        version: 1,
        updates: { enabled: true, lastCheckedAt },
      }).updates).toEqual({ enabled: true, lastCheckedAt: null });
    }
  });

  it("AC-R08-01: returns a fresh object and never mutates the input", () => {
    const input = { version: 0, editor: { tabWidth: 4 } };

    const first = normalizeSettings(input);
    const second = normalizeSettings(input);

    expect(input).toEqual({ version: 0, editor: { tabWidth: 4 } });
    expect(first).not.toBe(DEFAULT_SETTINGS);
    expect(first).not.toBe(second);
    expect(first.preview).not.toBe(second.preview);
    expect(first.ignore).not.toBe(second.ignore);
  });
});

describe("settings IPC contract", () => {
  it("uses fixed settings channels", () => {
    expect(SETTINGS_CHANNELS).toEqual({
      read: "settings:read",
      write: "settings:write",
    });
  });

  it("accepts only an empty object for settings reads", () => {
    expect(isSettingsReadRequest({})).toBe(true);
    expect(isSettingsReadRequest({ extra: true })).toBe(false);
    expect(isSettingsReadRequest(null)).toBe(false);
    expect(isSettingsReadRequest([])).toBe(false);
  });

  it("accepts settings objects with unknown keys but rejects arrays and null", () => {
    expect(isSettingsWriteRequest({ futureOption: true })).toBe(true);
    expect(isSettingsWriteRequest([])).toBe(false);
    expect(isSettingsWriteRequest(null)).toBe(false);
  });
});
