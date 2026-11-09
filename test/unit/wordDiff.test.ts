import { describe, expect, it } from "vitest";

import { diffLines } from "../../src/shared/diff/lineDiff";
import { diffWords } from "../../src/shared/diff/wordDiff";

describe("word diff", () => {
  it("AC-R14-02: marks only one changed word in a modified line", () => {
    expect(diffWords("The quick fox", "The slow fox", {})).toEqual({
      limited: false,
      left: [
        { kind: "same", text: "The " },
        { kind: "changed", text: "quick" },
        { kind: "same", text: " fox" },
      ],
      right: [
        { kind: "same", text: "The " },
        { kind: "changed", text: "slow" },
        { kind: "same", text: " fox" },
      ],
    });
  });

  it("AC-R14-11: limits word work while the line diff still returns", () => {
    const left = Array.from({ length: 20 }, (_, index) => `left${index}`).join(
      " ",
    );
    const right = Array.from(
      { length: 20 },
      (_, index) => `right${index}`,
    ).join(" ");

    expect(diffWords(left, right, { workLimit: 10 })).toEqual({ limited: true });
    expect(diffLines([left], [right], {}).hunks).toHaveLength(1);
  });

  it("boundary: returns one same span for identical lines", () => {
    expect(diffWords("same words", "same words", {})).toEqual({
      limited: false,
      left: [{ kind: "same", text: "same words" }],
      right: [{ kind: "same", text: "same words" }],
    });
  });

  it("boundary: returns no spans for two empty lines", () => {
    expect(diffWords("", "", {})).toEqual({
      limited: false,
      left: [],
      right: [],
    });
  });

  it("boundary: marks one empty side and one changed side", () => {
    expect(diffWords("", "new text", {})).toEqual({
      limited: false,
      left: [],
      right: [{ kind: "changed", text: "new text" }],
    });
  });
});
