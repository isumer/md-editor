import { describe, it, expect } from "vitest";
import { normalizeChord, resolveUserBindings } from "../../src/shared/keymap/userBindings";
import type { Bindings, BindingProblem } from "../../src/shared/keymap/userBindings";

describe("AC-R13-05: userBindings", () => {
  describe("normalizeChord", () => {
    it("normalises modifier order and letter case", () => {
      expect(normalizeChord("Shift-Mod-K", "linux")).toBe("Mod-Shift-k");
      expect(normalizeChord("Alt-Mod-F5", "linux")).toBe("Mod-Alt-F5");
    });

    it("rejects malformed chords", () => {
      expect(normalizeChord("", "linux")).toBeNull();
      expect(normalizeChord("k", "linux")).toBeNull();
      expect(normalizeChord("Mod-", "linux")).toBeNull();
      expect(normalizeChord("Mod--", "linux")).toBeNull();
      expect(normalizeChord("-a", "linux")).toBeNull();
      expect(normalizeChord("Hyper-a", "linux")).toBeNull();
      expect(normalizeChord("Mod-Mod-a", "linux")).toBeNull();
      expect(normalizeChord("Mod-Shift-ab", "linux")).toBeNull();
      expect(normalizeChord("Mod-f13", "linux")).toBeNull();
      expect(normalizeChord("Mod- ", "linux")).toBeNull();
    });

    it("applies the platform's modifier names", () => {
      expect(normalizeChord("Ctrl-Mod-a", "darwin")).toBe("Mod-Ctrl-a");
      expect(normalizeChord("Ctrl-Mod-a", "linux")).toBeNull();
      expect(normalizeChord("Meta-a", "linux")).toBe("Meta-a");
      expect(normalizeChord("Meta-a", "darwin")).toBeNull();
    });
  });

  describe("resolveUserBindings", () => {
    it("binds, rebinds and unbinds", () => {
      const defaults: Bindings = Object.freeze({
        "Mod-s": "file.save",
        "Mod-y": "redo",
      });
      const user = {
        "Mod-Shift-K": "lines.delete",
        "Mod-s": "file.saveAll",
        "Mod-y": null,
      };
      const result = resolveUserBindings(defaults, user, "linux");
      expect(result.bindings).toEqual({
        "Mod-s": "file.saveAll",
        "Mod-y": undefined,
        "Mod-Shift-k": "lines.delete",
      });
      expect(result.problems).toEqual([]);
    });

    it("reports every invalid entry and keeps the defaults", () => {
      const defaults: Bindings = Object.freeze({
        "Mod-s": "file.save",
      });
      const user = Object.fromEntries([
        ["invalid", "cmd1"],
        ["Mod-k", ""],
        ["Mod-j", "a b"],
        ["Mod-h", 42],
        ["Mod-K", "cmd2"],
      ]);
      const result = resolveUserBindings(defaults, user, "linux");
      expect(result.bindings).toEqual({ "Mod-s": "file.save" });
      expect(result.problems).toEqual([
        { chord: "invalid", reason: "invalid-chord" },
        { chord: "Mod-k", reason: "invalid-command" },
        { chord: "Mod-j", reason: "invalid-command" },
        { chord: "Mod-h", reason: "invalid-command" },
        { chord: "Mod-K", reason: "duplicate" },
      ]);
    });

    it("reports AltGr chords on Windows only", () => {
      const defaults: Bindings = Object.freeze({});
      const resultWin = resolveUserBindings(defaults, { "Mod-Alt-q": "cmd" }, "win32");
      expect(resultWin.bindings).toEqual({});
      expect(resultWin.problems).toEqual([{ chord: "Mod-Alt-q", reason: "unreachable-chord" }]);

      const resultLin = resolveUserBindings(defaults, { "Mod-Alt-q": "cmd" }, "linux");
      expect(resultLin.bindings).toEqual({ "Mod-Alt-q": "cmd" });
      expect(resultLin.problems).toEqual([]);

      const resultWinF5 = resolveUserBindings(defaults, { "Mod-Alt-F5": "cmd" }, "win32");
      expect(resultWinF5.bindings).toEqual({ "Mod-Alt-F5": "cmd" });
      expect(resultWinF5.problems).toEqual([]);
    });

    it("AC-R13-05: reports one-character AltGr chords with any modifiers", () => {
      expect(resolveUserBindings({}, { "Mod-Alt-Shift-q": "cmd" }, "win32")).toEqual({
        bindings: {},
        problems: [{ chord: "Mod-Alt-Shift-q", reason: "unreachable-chord" }],
      });
      expect(resolveUserBindings({}, { "Shift-Mod-Alt-Q": "cmd" }, "win32")).toEqual({
        bindings: {},
        problems: [{ chord: "Shift-Mod-Alt-Q", reason: "unreachable-chord" }],
      });
      expect(resolveUserBindings({}, { "Mod-Meta-Alt-q": "cmd" }, "win32")).toEqual({
        bindings: {},
        problems: [{ chord: "Mod-Meta-Alt-q", reason: "unreachable-chord" }],
      });
      expect(resolveUserBindings({}, { "Alt-Shift-q": "cmd" }, "win32")).toEqual({
        bindings: { "Alt-Shift-q": "cmd" },
        problems: [],
      });
    });

    it("AC-R13-05: rejects every whitespace key", () => {
      expect(normalizeChord("Mod-\v", "linux")).toEqual(null);
      expect(normalizeChord("Mod-\f", "linux")).toEqual(null);
      expect(normalizeChord("Mod-" + String.fromCharCode(0xa0), "linux")).toEqual(null);
      expect(resolveUserBindings({}, { "Mod-\v": "cmd" }, "linux")).toEqual({
        bindings: {},
        problems: [{ chord: "Mod-\v", reason: "invalid-chord" }],
      });
    });

    it("rejects a table that is not a plain object", () => {
      const defaults: Bindings = Object.freeze({ "Mod-s": "file.save" });
      for (const user of [null, [], "x", 42]) {
        const result = resolveUserBindings(defaults, user, "linux");
        expect(result.bindings).toEqual({ "Mod-s": "file.save" });
        expect(result.problems).toEqual([{ chord: "", reason: "invalid-table" }]);
      }
    });

    it("AC-R13-05: rejects tables that are not plain objects", () => {
      const defaults: Bindings = Object.freeze({ "Mod-s": "file.save" });
      for (const user of [new Date(0), new Map(), new (class Table {})()]) {
        expect(resolveUserBindings(defaults, user, "linux")).toEqual({
          bindings: { "Mod-s": "file.save" },
          problems: [{ chord: "", reason: "invalid-table" }],
        });
      }

      const user = Object.assign(Object.create(null), { "Mod-k": "cmd" });
      expect(resolveUserBindings({}, user, "linux")).toEqual({
        bindings: { "Mod-k": "cmd" },
        problems: [],
      });
    });

    it("ignores a __proto__ key", () => {
      const defaults: Bindings = Object.freeze({});
      const user = JSON.parse('{"__proto__": "x"}');
      const result = resolveUserBindings(defaults, user, "linux");
      expect(result.problems).toEqual([{ chord: "__proto__", reason: "invalid-chord" }]);
      expect(Object.getPrototypeOf(result.bindings)).toBe(Object.prototype);
    });

    it("does not mutate its inputs", () => {
      const defaults: Bindings = Object.freeze({ "Mod-s": "file.save" });
      const user = Object.freeze({ "Mod-k": "cmd" });
      const result = resolveUserBindings(defaults, user, "linux");
      expect(Object.isFrozen(result.bindings)).toBe(true);
      expect(Object.isFrozen(result.problems)).toBe(true);
      expect(defaults).toEqual({ "Mod-s": "file.save" });
      expect(user).toEqual({ "Mod-k": "cmd" });
    });
  });
});
