import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { contrastRatio, parseHexColor, type Rgb } from "../../src/shared/settings/appearance";

const STYLES_PATH = new URL("../../src/renderer/styles.css", import.meta.url);
const source = readFileSync(STYLES_PATH, "utf8");

const THEME_TOKENS = [
  "--surface-background",
  "--surface-muted-background",
  "--surface-text",
  "--muted-text",
  "--hover-background",
  "--selection-background",
  "--selection-text",
  "--border-color",
  "--control-border-color",
  "--focus-color",
  "--danger-text",
  "--accent-background",
  "--accent-text",
  "--error-background",
  "--error-text",
  "--error-border-color",
  "--overlay-background",
  "--diff-add-background",
  "--diff-add-emphasis",
  "--diff-remove-background",
  "--diff-remove-emphasis",
  "--diff-change-background",
  "--diff-change-emphasis",
  "--diff-change-marker",
] as const;

type TokenName = (typeof THEME_TOKENS)[number];
type Theme = Record<TokenName, string>;

const SELECTORS: Record<"light" | "dark", readonly string[]> = {
  light: [":root {", ':root[data-theme="light"] {'],
  dark: [':root:not([data-theme="light"]) {', ':root[data-theme="dark"] {'],
};

function readTheme(selector: string): Theme {
  const start = source.indexOf(selector);
  if (start === -1) {
    throw new Error(`missing theme block ${selector}`);
  }
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  const body = source.slice(open + 1, close);
  const tokens = new Map<string, string>();
  for (const match of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    tokens.set(`--${match[1]}`, match[2]?.trim() ?? "");
  }
  const theme = {} as Theme;
  for (const name of THEME_TOKENS) {
    const value = tokens.get(name);
    if (value === undefined) {
      throw new Error(`theme block ${selector} does not define ${name}`);
    }
    theme[name] = value;
  }
  return theme;
}

function color(value: string): Rgb {
  const parsed = parseHexColor(value);
  if (parsed === null) {
    throw new Error(`theme token is not a hex colour: ${value}`);
  }
  return parsed;
}

const TEXT_PAIRS: ReadonlyArray<readonly [text: TokenName, background: TokenName]> = [
  ["--surface-text", "--surface-background"],
  ["--surface-text", "--surface-muted-background"],
  ["--surface-text", "--hover-background"],
  ["--selection-text", "--selection-background"],
  ["--muted-text", "--surface-background"],
  ["--muted-text", "--surface-muted-background"],
  ["--muted-text", "--hover-background"],
  ["--danger-text", "--surface-background"],
  ["--danger-text", "--surface-muted-background"],
  ["--accent-text", "--accent-background"],
  ["--error-text", "--error-background"],
  ["--surface-text", "--diff-add-background"],
  ["--surface-text", "--diff-add-emphasis"],
  ["--surface-text", "--diff-remove-background"],
  ["--surface-text", "--diff-remove-emphasis"],
  ["--surface-text", "--diff-change-background"],
  ["--surface-text", "--diff-change-emphasis"],
];

const GRAPHIC_PAIRS: ReadonlyArray<readonly [graphic: TokenName, background: TokenName]> = [
  ["--control-border-color", "--surface-background"],
  ["--control-border-color", "--surface-muted-background"],
  ["--focus-color", "--surface-background"],
  ["--focus-color", "--surface-muted-background"],
  ["--diff-change-marker", "--surface-background"],
];

for (const themeName of ["light", "dark"] as const) {
  describe(`${themeName} theme tokens`, () => {
    const themes = SELECTORS[themeName].map((selector) => ({
      selector,
      theme: readTheme(selector),
    }));

    it("defines every token in every block", () => {
      expect(themes).toHaveLength(2);
    });

    for (const { selector, theme } of themes) {
      for (const [text, background] of TEXT_PAIRS) {
        it(`${selector} keeps ${text} readable on ${background}`, () => {
          const ratio = contrastRatio(color(theme[text]), color(theme[background]));
          expect(ratio, `${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
        });
      }

      for (const [graphic, background] of GRAPHIC_PAIRS) {
        it(`${selector} keeps ${graphic} visible on ${background}`, () => {
          const ratio = contrastRatio(color(theme[graphic]), color(theme[background]));
          expect(ratio, `${graphic} on ${background}`).toBeGreaterThanOrEqual(3);
        });
      }
    }
  });
}
