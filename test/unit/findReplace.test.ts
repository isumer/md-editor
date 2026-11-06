import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  findMatches,
  replaceAll,
  type FindOptions,
} from "../../src/shared/text/findReplace";

function fixture(name: string): string {
  return readFileSync(
    new URL(`../fixtures/find-replace/${name}`, import.meta.url),
    "utf8",
  );
}

function options(overrides: Partial<FindOptions> = {}): FindOptions {
  return { matchCase: true, wholeWord: false, regex: false, ...overrides };
}

describe("AC-R12-04: find and replace", () => {
  it("AC-R12-04: matches the mixed-case fixture", () => {
    const text = fixture("mixed-case.md");

    expect(findMatches(text, "Cat", options())).toHaveLength(3);
    expect(findMatches(text, "cat", options())).toHaveLength(5);
    expect(findMatches(text, "CAT", options())).toHaveLength(2);
    expect(findMatches(text, "cAt", options())).toHaveLength(2);
    expect(findMatches(text, "catalog", options())).toHaveLength(2);
    expect(
      findMatches(text, "cat", options({ matchCase: false })),
    ).toHaveLength(12);
    expect(findMatches(text, "cat", options({ wholeWord: true }))).toHaveLength(
      3,
    );
  });

  it("AC-R12-04: matches the whole-word fixture", () => {
    const text = fixture("whole-words.md");

    expect(findMatches(text, "cat", options({ wholeWord: true }))).toHaveLength(
      5,
    );
    expect(findMatches(text, "cats", options())).toHaveLength(2);
    expect(findMatches(text, "copycat", options())).toHaveLength(2);
    expect(findMatches(text, "concatenate", options())).toHaveLength(2);
    expect(findMatches(text, "cat", options())).toHaveLength(11);
  });

  it("AC-R12-04: treats metacharacters literally", () => {
    const text = fixture("regex-meta.md");

    expect(findMatches(text, ".", options())).toHaveLength(4);
    for (const metacharacter of [
      "*",
      "+",
      "?",
      "[",
      "]",
      "(",
      ")",
      "{",
      "}",
      "^",
      "$",
      "|",
      "\\",
    ]) {
      expect(findMatches(text, metacharacter, options())).toHaveLength(2);
    }
    expect(findMatches(text, "a.c", options())).toHaveLength(2);
  });

  it("AC-R12-04: matches Unicode text by code unit", () => {
    const text = fixture("unicode.md");

    for (const letter of ["ğ", "ü", "ş", "ı", "ö", "ç", "İ"]) {
      expect(findMatches(text, letter, options())).toHaveLength(2);
    }
    expect(findMatches(text, "i", options())).toHaveLength(4);

    const firstCapitalDottedI = findMatches(text, "İ", options())[0];
    expect(firstCapitalDottedI).toEqual({ start: 14, end: 15 });
  });

  it("AC-R12-04: supports regular expressions", () => {
    const matches = findMatches(
      "a1 b2",
      "([a-z])(\\d)",
      options({ regex: true }),
    );

    expect(matches).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
    ]);
  });

  it("AC-R12-04: filters whole-word matches in both modes", () => {
    const text = fixture("whole-words.md");

    const literal = findMatches(text, "cat", options({ wholeWord: true }));
    const regex = findMatches(
      text,
      "cat",
      options({ wholeWord: true, regex: true }),
    );

    expect(literal).toHaveLength(5);
    expect(regex).toEqual(literal);
  });

  it("AC-R12-04: drops zero-length matches", () => {
    expect(findMatches("ab", "^", options({ regex: true }))).toEqual([]);
    expect(findMatches("ab", "x*", options({ regex: true }))).toEqual([]);
    expect(findMatches("aab", "a*", options({ regex: true }))).toEqual([
      { start: 0, end: 2 },
    ]);
  });

  it("AC-R12-04: rejects an invalid regular expression", () => {
    const invalid = options({ regex: true });

    expect(findMatches("abc", "(", invalid)).toEqual([]);
    expect(replaceAll("abc", "(", "x", invalid)).toEqual({
      text: "abc",
      count: 0,
    });
  });

  it("AC-R12-04: replaces literal text exactly", () => {
    const text = fixture("regex-meta.md");

    expect(replaceAll(text, ".", "X", options())).toMatchObject({ count: 4 });
    expect(replaceAll("a.b", ".", "$&", options())).toEqual({
      text: "a$&b",
      count: 1,
    });
  });

  it("AC-R12-04: expands groups in regex mode", () => {
    const regex = options({ regex: true });

    expect(replaceAll("a1 b2", "([a-z])(\\d)", "$2$1", regex)).toEqual({
      text: "1a 2b",
      count: 2,
    });
    expect(replaceAll("a1 b2", "([a-z])(\\d)", "$$", regex)).toEqual({
      text: "$ $",
      count: 2,
    });
    expect(replaceAll("a1 b2", "([a-z])(\\d)", "$&", regex)).toEqual({
      text: "a1 b2",
      count: 2,
    });
    expect(replaceAll("a1 b2", "([a-z])(\\d)", "$9", regex)).toEqual({
      text: " ",
      count: 2,
    });
  });

  it("AC-R12-04: keeps the text when nothing matches", () => {
    expect(findMatches("abc", "z", options())).toEqual([]);
    expect(replaceAll("abc", "z", "x", options())).toEqual({
      text: "abc",
      count: 0,
    });
  });
});
