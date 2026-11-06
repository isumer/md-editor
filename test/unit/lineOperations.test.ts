import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  removeConsecutiveDuplicateLines,
  removeDuplicateLines,
  removeEmptyLines,
  sortLines,
  trimTrailingWhitespace,
} from "../../src/shared/lines/lineOperations";

const fixtures = new URL("../fixtures/powertools/", import.meta.url);
const temporaryDirectories: string[] = [];

function makeTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "line-operations-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function splitLines(text: string): string[] {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

function fixtureLines(name: string): string[] {
  return splitLines(readFileSync(new URL(name, fixtures), "utf8"));
}

function isNonDecreasing(lines: readonly string[]): boolean {
  for (let index = 1; index < lines.length; index += 1) {
    const previous = lines[index - 1];
    const current = lines[index];
    if (previous === undefined || current === undefined || previous > current) {
      return false;
    }
  }
  return true;
}

describe("AC-R13-02: line operations", () => {
  it("AC-R13-02: sorts the fixture like C sort", () => {
    const lines = fixtureLines("sort-dedupe.txt");

    const sorted = sortLines(lines, "ascending");

    expect(lines).toHaveLength(200);
    expect(sorted).toHaveLength(200);
    expect(sorted.slice(0, 3)).toEqual([
      "line-000001 | client result update client",
      "line-000002 | archive memory layout output",
      "line-000003 | filter token graph client engine event",
    ]);
    expect(sorted.slice(-3)).toEqual([
      "line-000197 | engine content process",
      "line-000198 | buffer chunk",
      "line-000199 | toolbar column editor preview inline",
    ]);
  });

  it("AC-R13-02: removes the fixture duplicates", () => {
    const lines = fixtureLines("sort-dedupe.txt");
    const firstPositions = new Map<string, number>();
    lines.forEach((line, index) => {
      if (!firstPositions.has(line)) {
        firstPositions.set(line, index);
      }
    });
    const firstCopies = lines.filter(
      (line, index) => firstPositions.get(line) === index,
    );

    const deduped = removeDuplicateLines(lines);

    expect(lines).toHaveLength(200);
    expect(deduped).toHaveLength(180);
    expect(deduped).toEqual(firstCopies);
  });

  it("AC-R13-02: compares duplicate lines exactly", () => {
    expect(removeDuplicateLines(["a", "A", "a", " a"])).toEqual([
      "a",
      "A",
      " a",
    ]);
  });

  it("AC-R13-02: compares consecutive duplicate lines exactly", () => {
    expect(removeConsecutiveDuplicateLines(["a", "A", "a"])).toEqual([
      "a",
      "A",
      "a",
    ]);
  });

  it("AC-R13-02: handles 100,000 lines", () => {
    const directory = makeTemporaryDirectory();
    const generated = join(directory, "sort-dedupe-100000.txt");
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL("generate.mjs", fixtures)), "100000", generated],
      { stdio: "pipe" },
    );
    const lines = splitLines(readFileSync(generated, "utf8"));

    const sorted = sortLines(lines, "ascending");
    const deduped = removeDuplicateLines(sorted);

    expect(lines).toHaveLength(100_000);
    expect(sorted).toHaveLength(100_000);
    expect(isNonDecreasing(sorted)).toBe(true);
    expect(deduped).toHaveLength(90_000);
  });

  it("AC-R13-02: keeps a stable order for equal keys", () => {
    const lines = ["b", "B", "a", "A"];

    expect(sortLines(lines, "ascending-ignore-case")).toEqual([
      "a",
      "A",
      "b",
      "B",
    ]);
    expect(sortLines(lines, "descending-ignore-case")).toEqual([
      "b",
      "B",
      "a",
      "A",
    ]);
  });

  it("AC-R13-02: sorts in code-unit order", () => {
    const lines = ["é", "z", "Z", "e"];

    expect(sortLines(lines, "ascending")).toEqual(["Z", "e", "z", "é"]);
    expect(sortLines(lines, "descending")).toEqual(["é", "z", "e", "Z"]);
  });

  it("AC-R13-02: removes only consecutive duplicates", () => {
    expect(removeConsecutiveDuplicateLines(["a", "a", "b", "a"])).toEqual([
      "a",
      "b",
      "a",
    ]);
  });

  it("AC-R13-02: removes empty lines", () => {
    const lines = ["a", "", " \t", "b"];

    expect(removeEmptyLines(lines, false)).toEqual(["a", " \t", "b"]);
    expect(removeEmptyLines(lines, true)).toEqual(["a", "b"]);
  });

  it("AC-R13-02: trims trailing spaces and tabs only", () => {
    expect(trimTrailingWhitespace(["a \t"])).toEqual(["a"]);
    expect(trimTrailingWhitespace(["a "])).toEqual(["a "]);
  });

  it("AC-R13-02: never changes the input", () => {
    const input = Object.freeze(["", "b", "a \t", "b", "a "]);

    const results = () => [
      sortLines(input, "ascending"),
      sortLines(input, "descending"),
      sortLines(input, "ascending-ignore-case"),
      sortLines(input, "descending-ignore-case"),
      removeDuplicateLines(input),
      removeConsecutiveDuplicateLines(input),
      removeEmptyLines(input, false),
      removeEmptyLines(input, true),
      trimTrailingWhitespace(input),
    ];

    expect(results).not.toThrow();
    for (const result of results()) {
      expect(result).not.toBe(input);
    }
    expect(input).toEqual(["", "b", "a \t", "b", "a "]);
  });
});
