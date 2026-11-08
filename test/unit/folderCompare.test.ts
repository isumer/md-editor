import { describe, expect, it } from "vitest";

import {
  compareFolders,
  type FolderCompareRow,
  type FolderEntry,
} from "../../src/shared/diff/folderCompare";

function statuses(rows: readonly FolderCompareRow[]): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.path, row.status]));
}

describe("folder compare", () => {
  it("AC-R14-12: classifies every entry of two small trees", () => {
    const left: readonly FolderEntry[] = [
      { path: "docs", kind: "folder" },
      { path: "docs/changed.md", kind: "file", textKey: "left" },
      { path: "docs/same.md", kind: "file", textKey: "same" },
      { path: "left.md", kind: "file", textKey: "left" },
      { path: "mismatch", kind: "file", textKey: "file" },
    ];
    const right: readonly FolderEntry[] = [
      { path: "docs", kind: "folder" },
      { path: "docs/changed.md", kind: "file", textKey: "right" },
      { path: "docs/same.md", kind: "file", textKey: "same" },
      { path: "mismatch", kind: "folder" },
      { path: "mismatch/hidden.md", kind: "file", textKey: "hidden" },
      { path: "right.md", kind: "file", textKey: "right" },
    ];

    const rows = compareFolders(left, right, { mode: "contents" });

    expect(statuses(rows)).toEqual({
      "docs/changed.md": "changed",
      "docs/same.md": "identical",
      "left.md": "left-only",
      mismatch: "type-mismatch",
      "right.md": "right-only",
    });
    expect(rows.map((row) => row.path)).not.toContain("docs");
    expect(rows.map((row) => row.path)).not.toContain("mismatch/hidden.md");
  });

  it("AC-R14-12: reports an unreadable entry as error", () => {
    const left: readonly FolderEntry[] = [
      { path: "left-error.md", kind: "file", error: "denied" },
      { path: "right-error.md", kind: "file", textKey: "left" },
      { path: "single-error.md", kind: "file", error: "denied" },
    ];
    const right: readonly FolderEntry[] = [
      { path: "left-error.md", kind: "file", textKey: "right" },
      { path: "right-error.md", kind: "file", error: "denied" },
      { path: "right-single-error.md", kind: "file", error: "denied" },
    ];

    const rows = compareFolders(left, right, { mode: "contents" });

    expect(statuses(rows)).toEqual({
      "left-error.md": "error",
      "right-error.md": "error",
      "right-single-error.md": "error",
      "single-error.md": "error",
    });
  });

  it("AC-R14-12: compares binary files by their binary key", () => {
    const left: readonly FolderEntry[] = [
      { path: "different.bin", kind: "file", binary: true, binaryKey: "left" },
      { path: "equal.bin", kind: "file", binary: true, binaryKey: "same" },
      { path: "mixed.dat", kind: "file", binary: true, textKey: "decoded" },
    ];
    const right: readonly FolderEntry[] = [
      { path: "different.bin", kind: "file", binary: true, binaryKey: "right" },
      { path: "equal.bin", kind: "file", binary: true, binaryKey: "same" },
      { path: "mixed.dat", kind: "file", binary: false, textKey: "decoded" },
    ];

    const rows = compareFolders(left, right, { mode: "contents" });

    expect(statuses(rows)).toEqual({
      "different.bin": "binary-differs",
      "equal.bin": "identical",
      "mixed.dat": "identical",
    });
  });

  it("AC-R14-12: orders rows by path", () => {
    const left: readonly FolderEntry[] = [
      { path: "z.md", kind: "file" },
      { path: "a.md", kind: "file" },
      { path: "middle.md", kind: "file" },
    ];

    const rows = compareFolders(left, [], { mode: "contents" });

    expect(rows.map((row) => row.path)).toEqual(["a.md", "middle.md", "z.md"]);
  });

  it("AC-R14-12: keeps the first entry for a duplicate path", () => {
    const left: readonly FolderEntry[] = [
      { path: "dup.md", kind: "file", textKey: "first" },
      { path: "dup.md", kind: "file", textKey: "second" },
    ];
    const right: readonly FolderEntry[] = [
      { path: "dup.md", kind: "file", textKey: "first" },
    ];

    const rows = compareFolders(left, right, { mode: "contents" });

    expect(rows.map((row) => row.path)).toEqual(["dup.md"]);
    expect(statuses(rows)).toEqual({ "dup.md": "identical" });
  });

  it("AC-R14-12: a missing key counts as unequal", () => {
    const left: readonly FolderEntry[] = [
      { path: "both-missing.md", kind: "file" },
      { path: "left-missing.md", kind: "file" },
      { path: "binary-missing.bin", kind: "file", binary: true },
    ];
    const right: readonly FolderEntry[] = [
      { path: "both-missing.md", kind: "file" },
      { path: "left-missing.md", kind: "file", textKey: "same" },
      { path: "binary-missing.bin", kind: "file", binary: true },
    ];

    const rows = compareFolders(left, right, { mode: "contents" });

    expect(statuses(rows)).toEqual({
      "binary-missing.bin": "binary-differs",
      "both-missing.md": "changed",
      "left-missing.md": "changed",
    });
  });

  it("AC-R14-12: reports a one-sided folder once and skips its descendants", () => {
    const left: readonly FolderEntry[] = [
      { path: "gone", kind: "folder" },
      { path: "gone/a.md", kind: "file" },
      { path: "gone/deep", kind: "folder" },
      { path: "gone/deep/b.md", kind: "file" },
    ];
    const right: readonly FolderEntry[] = [
      { path: "new", kind: "folder" },
      { path: "new/c.md", kind: "file" },
    ];

    const rows = compareFolders(left, right, { mode: "contents" });

    expect(statuses(rows)).toEqual({ gone: "left-only", new: "right-only" });
  });

  it("AC-R14-14: size-and-timestamp mode reads no content", () => {
    const unreadableContent = {
      path: "same.bin",
      kind: "file" as const,
      size: 12,
      modifiedMs: 34,
      get textKey(): string {
        throw new Error("textKey was read");
      },
      get binaryKey(): string {
        throw new Error("binaryKey was read");
      },
      get binary(): boolean {
        throw new Error("binary was read");
      },
    };
    const right: FolderEntry = {
      path: "same.bin",
      kind: "file",
      size: 12,
      modifiedMs: 34,
      textKey: "different",
      binaryKey: "different",
      binary: true,
    };

    const rows = compareFolders([unreadableContent], [right], {
      mode: "size-and-timestamp",
    });

    expect(statuses(rows)).toEqual({ "same.bin": "identical" });
  });

  it("AC-R14-14: size-and-timestamp mode reports a size or timestamp change", () => {
    const left: readonly FolderEntry[] = [
      { path: "size.md", kind: "file", size: 10, modifiedMs: 20 },
      { path: "time.md", kind: "file", size: 10, modifiedMs: 20 },
    ];
    const right: readonly FolderEntry[] = [
      { path: "size.md", kind: "file", size: 11, modifiedMs: 20 },
      { path: "time.md", kind: "file", size: 10, modifiedMs: 21 },
    ];

    const rows = compareFolders(left, right, { mode: "size-and-timestamp" });

    expect(statuses(rows)).toEqual({ "size.md": "changed", "time.md": "changed" });
  });

  it("AC-R14-15: excludes folders and their descendants", () => {
    const left: readonly FolderEntry[] = [
      { path: ".git", kind: "folder" },
      { path: ".git/config", kind: "file" },
      { path: "node_modules", kind: "folder" },
      { path: "node_modules/package/index.js", kind: "file" },
      { path: "src/node_modules", kind: "folder" },
      { path: "src/node_modules/nested.js", kind: "file" },
      { path: "src/keep.md", kind: "file" },
    ];

    const rows = compareFolders(left, [], {
      mode: "contents",
      exclude: [".git", "node_modules"],
    });

    expect(rows.map((row) => row.path)).toEqual(["src/keep.md"]);
  });

  it("AC-R14-15: keeps only matching rows and only differences", () => {
    const left: readonly FolderEntry[] = [
      { path: "match-changed.md", kind: "file", textKey: "left" },
      { path: "match-same.md", kind: "file", textKey: "same" },
      { path: "other-changed.md", kind: "file", textKey: "left" },
    ];
    const right: readonly FolderEntry[] = [
      { path: "match-changed.md", kind: "file", textKey: "right" },
      { path: "match-same.md", kind: "file", textKey: "same" },
      { path: "other-changed.md", kind: "file", textKey: "right" },
    ];

    const included = compareFolders(left, right, {
      mode: "contents",
      include: /^match-/g,
    });
    const differences = compareFolders(left, right, {
      mode: "contents",
      onlyDifferences: true,
    });
    const combined = compareFolders(left, right, {
      mode: "contents",
      include: /^match-/g,
      onlyDifferences: true,
    });

    expect(included.map((row) => row.path)).toEqual([
      "match-changed.md",
      "match-same.md",
    ]);
    expect(differences.map((row) => row.path)).toEqual([
      "match-changed.md",
      "other-changed.md",
    ]);
    expect(combined.map((row) => row.path)).toEqual(["match-changed.md"]);
  });

  it("AC-R14-12: does not mutate its input", () => {
    const leftEntry = Object.freeze({
      path: "left.md",
      kind: "file" as const,
      textKey: "left",
    });
    const rightEntry = Object.freeze({
      path: "right.md",
      kind: "file" as const,
      textKey: "right",
    });
    const left: readonly FolderEntry[] = Object.freeze([leftEntry]);
    const right: readonly FolderEntry[] = Object.freeze([rightEntry]);

    expect(() => compareFolders(left, right, { mode: "contents" })).not.toThrow();
    expect(left).toEqual([leftEntry]);
    expect(right).toEqual([rightEntry]);
  });
});
