# Slice 12 part — appearance colours (NIM lane)

Base: main

A pure module for stored background colours and readable text colours.
Slice 12 wiring calls it later. This item adds no settings write, no
window and no theme switch. AC-R7-01 to -04 stay `planned`. No new
dependencies.

## Allowed files
New files only:
- `src/shared/settings/appearance.ts`
- `test/unit/appearance.test.ts`

Change no other file. `src/shared` modules have zero imports, so
`appearance.ts` imports nothing.

## Types
Export exactly these values and functions from `appearance.ts`.

```ts
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}
export function parseHexColor(value: unknown): Rgb | null;
export function formatHexColor(color: Rgb): string;
export function relativeLuminance(color: Rgb): number;
export function contrastRatio(a: Rgb, b: Rgb): number;
export function textColorFor(background: Rgb): "#000000" | "#ffffff";
export function resolveBackground(custom: unknown, themeDefault: string): string;
```

## Rules
1. `parseHexColor` accepts only `#rgb` or `#rrggbb`, in either case, with
   no space before or after. `#rgb` doubles each digit (`#abc` is
   `#aabbcc`). It returns `null` for everything else: a missing value, a
   number, a named colour, `rgb(...)`, a wrong length and a non-hex
   digit.
2. `formatHexColor` returns `#rrggbb` in lower case with two digits per
   channel.
3. `relativeLuminance` uses the WCAG 2.1 sRGB formula: for each channel
   `c`, `s = c / 255`, then `s / 12.92` when `s <= 0.03928`, otherwise
   `((s + 0.055) / 1.055) ** 2.4`; the result is
   `0.2126 * r + 0.7152 * g + 0.0722 * b`.
4. `contrastRatio` returns `(hi + 0.05) / (lo + 0.05)` where `hi` and
   `lo` are the larger and smaller luminances. It is 1 for one colour
   and 21 for black against white.
5. `textColorFor` returns `#ffffff` when its contrast with the
   background is at least the contrast of `#000000`, otherwise
   `#000000`.
6. `resolveBackground` returns `formatHexColor` of a value that
   `parseHexColor` accepts. It returns `themeDefault` unchanged for every
   other value. It does not validate `themeDefault`.
7. No function mutates its input.

## Tests (`test/unit/appearance.test.ts`)
Every title starts `AC-R7-03:` or `AC-R7-04:`. Use exact expected values.
- `AC-R7-03: parses both hex forms and lower-cases the result` —
  `#abc` gives `{ r: 170, g: 187, b: 204 }` and formats as `#aabbcc`.
- `AC-R7-03: rejects every invalid stored colour` — `null`, `42`,
  `"red"`, `"rgb(0,0,0)"`, `"#12"`, `"#gggggg"` and `" #ffffff"` all
  give `null`.
- `AC-R7-03: falls back to the theme default` — a valid colour replaces
  the default and normalises its case; each invalid value returns the
  string given as `themeDefault` unchanged.
- `AC-R7-04: computes the WCAG luminance boundary` — `relativeLuminance`
  of `#808080` is about 0.216 (three decimals).
- `AC-R7-04: computes exact contrast values` — black against white is
  21, one colour against itself is 1, and `#767676` against white is
  about 4.542.
- `AC-R7-04: picks the readable text colour` — `#ffffff` on `#000080`,
  `#000000` on `#808080` and `#ffffff` on `#767676`, whose contrast with
  white is above 4.5.
- `does not mutate its input` — freeze the colour objects.

Red evidence: break rule 1's `#rgb` expansion, rule 3's `0.03928`
threshold and rule 6's fallback once each, confirm a test goes red, and
restore the line. Paste all three runs.

## Done means
`npm run typecheck`, `npm run check:deps` and `npm run test:unit` exit 0
— paste. List changed files. Paste the red evidence. Do not change the
coverage baseline, acceptance files or workflows.
