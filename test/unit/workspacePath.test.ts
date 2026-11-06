import { describe, expect, it } from "vitest";

import { checkWorkspacePath } from "../../src/shared/workspace/workspacePath";

describe("workspace path safety", () => {
  it("AC-R11-07: refuses a parent segment", () => {
    expect(checkWorkspacePath("../outside.md")).toEqual({ ok: false, reason: "parent" });
    expect(checkWorkspacePath("a/../../b.md")).toEqual({ ok: false, reason: "parent" });
  });

  it("AC-R11-07: refuses an absolute path", () => {
    const inputs = ["/etc/passwd", "\\\\server\\share\\x.md", "C:\\x.md", "c:/x.md"];

    for (const input of inputs) {
      expect(checkWorkspacePath(input)).toEqual({ ok: false, reason: "absolute" });
    }
  });

  it("AC-R11-07: refuses a Windows device name", () => {
    for (const input of ["CON", "aux.md", "COM1", "Lpt9.txt"]) {
      expect(checkWorkspacePath(input)).toEqual({ ok: false, reason: "device-name" });
    }
    expect(checkWorkspacePath("CONSOLE.md")).toEqual({
      ok: true,
      segments: ["CONSOLE.md"],
    });
  });

  it("AC-R11-07: refuses an alternate data stream", () => {
    expect(checkWorkspacePath("notes.md:secret")).toEqual({
      ok: false,
      reason: "alternate-stream",
    });
    expect(checkWorkspacePath("a:b.md")).toEqual({
      ok: false,
      reason: "alternate-stream",
    });
  });

  it("AC-R11-07: refuses empty, dot, separator and trailing forms", () => {
    const cases = [
      ["", "empty"],
      ["  ", "empty"],
      [".", "dot"],
      ["a/./b", "dot"],
      ["a//b", "separator"],
      ["a/", "separator"],
      ["notes.md.", "trailing-dot"],
      ["notes.md ", "trailing-dot"],
      ["a\u0000b", "control"],
    ] as const;

    for (const [input, reason] of cases) {
      expect(checkWorkspacePath(input)).toEqual({ ok: false, reason });
    }
  });

  it("AC-R11-07: returns the segments of a relative path", () => {
    expect(checkWorkspacePath("a/b/notes.md")).toEqual({
      ok: true,
      segments: ["a", "b", "notes.md"],
    });
    expect(checkWorkspacePath("Über.md")).toEqual({ ok: true, segments: ["Über.md"] });
    expect(checkWorkspacePath("Mixed.Case.MD")).toEqual({
      ok: true,
      segments: ["Mixed.Case.MD"],
    });
  });
});
