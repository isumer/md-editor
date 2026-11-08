import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  formatHexColor,
  parseHexColor,
  relativeLuminance,
  resolveBackground,
  textColorFor,
} from "../../src/shared/settings/appearance";

describe("AC-R7-03: parses both hex forms and lower-cases the result", () => {
  it("parses #abc and doubles each digit", () => {
    const parsed = parseHexColor("#abc");
    expect(parsed).toEqual({ r: 170, g: 187, b: 204 });
    expect(formatHexColor(parsed!)).toBe("#aabbcc");
  });

  it("parses #rrggbb and preserves values", () => {
    const parsed = parseHexColor("#aabbcc");
    expect(parsed).toEqual({ r: 170, g: 187, b: 204 });
    expect(formatHexColor(parsed!)).toBe("#aabbcc");
  });

  it("parses uppercase hex and lower-cases output", () => {
    const parsed = parseHexColor("#ABC");
    expect(parsed).toEqual({ r: 170, g: 187, b: 204 });
    expect(formatHexColor(parsed!)).toBe("#aabbcc");
  });

  it("parses mixed case hex and lower-cases output", () => {
    const parsed = parseHexColor("#AaBbCc");
    expect(parsed).toEqual({ r: 170, g: 187, b: 204 });
    expect(formatHexColor(parsed!)).toBe("#aabbcc");
  });
});

describe("AC-R7-03: rejects every invalid stored colour", () => {
  const invalid = [
    null,
    42,
    "red",
    "rgb(0,0,0)",
    "#12",
    "#gggggg",
    " #ffffff",
    "#ffffff ",
    "#12345",
    "#1234567",
    "",
    "#",
    "##ffffff",
    "0xffffff",
    { r: 255, g: 255, b: 255 },
    "#+5+5+5",
    "#-5-5-5",
    "# 5 5 5",
    "#5_67ab",
    "#+abc",
  ];

  for (const value of invalid) {
    it(`returns null for ${JSON.stringify(value)}`, () => {
      expect(parseHexColor(value)).toBeNull();
    });
  }
});

describe("AC-R7-03: falls back to the theme default", () => {
  const themeDefault = "#123456";

  it("returns formatted valid colour", () => {
    expect(resolveBackground("#abc", themeDefault)).toBe("#aabbcc");
    expect(resolveBackground("#AABBCC", themeDefault)).toBe("#aabbcc");
  });

  it("returns themeDefault unchanged for each invalid value", () => {
    const invalid = [
      null,
      42,
      "red",
      "rgb(0,0,0)",
      "#12",
      "#gggggg",
      " #ffffff",
      "#+5+5+5",
      "#-5-5-5",
    ];

    for (const value of invalid) {
      expect(resolveBackground(value, themeDefault)).toBe(themeDefault);
    }
  });
});

describe("AC-R7-04: computes the WCAG luminance boundary", () => {
  it("relativeLuminance of #808080 is about 0.216", () => {
    const color = parseHexColor("#808080")!;
    expect(relativeLuminance(color)).toBeCloseTo(0.216, 3);
  });
});

describe("AC-R7-04: computes exact contrast values", () => {
  it("black against white is 21", () => {
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };
    expect(contrastRatio(black, white)).toBe(21);
  });

  it("one colour against itself is 1", () => {
    const color = { r: 118, g: 118, b: 118 };
    expect(contrastRatio(color, color)).toBe(1);
  });

  it("#767676 against white is about 4.542", () => {
    const color = { r: 118, g: 118, b: 118 };
    const white = { r: 255, g: 255, b: 255 };
    expect(contrastRatio(color, white)).toBeCloseTo(4.542, 3);
  });
});

describe("AC-R7-04: picks the readable text colour", () => {
  it("#ffffff on #000080 (navy)", () => {
    const navy = { r: 0, g: 0, b: 128 };
    expect(textColorFor(navy)).toBe("#ffffff");
  });

  it("#000000 on #808080 (gray)", () => {
    const gray = { r: 128, g: 128, b: 128 };
    expect(textColorFor(gray)).toBe("#000000");
  });

  it("#000000 on #767676 (contrast with black higher than white)", () => {
    const color = { r: 118, g: 118, b: 118 };
    expect(textColorFor(color)).toBe("#000000");
  });
});

describe("does not mutate its input", () => {
  it("parseHexColor does not mutate input", () => {
    const input = "#abc";
    parseHexColor(input);
    expect(input).toBe("#abc");
  });

  it("formatHexColor does not mutate input", () => {
    const color = Object.freeze({ r: 170, g: 187, b: 204 });
    formatHexColor(color);
    expect(color).toEqual({ r: 170, g: 187, b: 204 });
  });

  it("relativeLuminance does not mutate input", () => {
    const color = Object.freeze({ r: 128, g: 128, b: 128 });
    relativeLuminance(color);
    expect(color).toEqual({ r: 128, g: 128, b: 128 });
  });

  it("contrastRatio does not mutate inputs", () => {
    const a = Object.freeze({ r: 118, g: 118, b: 118 });
    const b = Object.freeze({ r: 255, g: 255, b: 255 });
    contrastRatio(a, b);
    expect(a).toEqual({ r: 118, g: 118, b: 118 });
    expect(b).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("textColorFor does not mutate input", () => {
    const color = Object.freeze({ r: 118, g: 118, b: 118 });
    textColorFor(color);
    expect(color).toEqual({ r: 118, g: 118, b: 118 });
  });

  it("resolveBackground does not mutate input", () => {
    const input = "#abc";
    resolveBackground(input, "#123456");
    expect(input).toBe("#abc");
  });
});
