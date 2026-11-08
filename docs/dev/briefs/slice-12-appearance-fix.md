# Slice 12 fix — prove the luminance branch boundary (dev lane)

Base: main (continues the PR branch feature/slice12-appearance)

Review job 1010 reviewed candidate 7bd78ae and returned it. The module is
correct. The tests and one test instruction are not. Fix the four findings
below. Do not change the module logic.

The original instruction had a wrong expectation for `#767676`. This brief
corrects it. The implementation and its test already pick `#000000`. Keep
that result.

## Allowed files

- `test/unit/appearance.test.ts`

You may edit `src/shared/settings/appearance.ts` only to break one line for
red evidence. Restore the line before you commit. The commit must not change
the module.

## 1. Prove the linear branch boundary (Major)

`relativeLuminance` uses the linear branch when `s <= 0.03928`, where
`s = c / 255`. The current test does not separate the two branches. A change
of `src/shared/settings/appearance.ts:49` from `s <= 0.03928` to `s <= 0`
left all 39 tests green.

Add one test to the `AC-R7-04: computes the WCAG luminance boundary` block:

- `it("AC-R7-04: uses the linear branch at the 0.03928 boundary", ...)`

The test must call `relativeLuminance` on three grey colours. For a grey
colour the weighted sum is exactly 1, so the result equals the per-channel
value.

| input | expected | why |
| --- | --- | --- |
| `{ r: 1, g: 1, b: 1 }` | `0.0003035269835488375` | linear branch, far from the boundary |
| `{ r: 10, g: 10, b: 10 }` | `0.003035269835488375` | last linear channel: `10 / 255 = 0.0392157 <= 0.03928` |
| `{ r: 11, g: 11, b: 11 }` | `0.003346535763899161` | first power channel: `11 / 255 = 0.0431373 > 0.03928` |

Assert each value with `toBeCloseTo(value, 8)`. The tolerance is 5e-9. The
first wrong-branch value differs by at least 7.5e-7.

Red evidence for finding 1: break the threshold twice and paste both runs.

1. Change `s <= 0.03928` to `s <= 0`. The test must go red at the 1 and 10
   inputs. Wrong values: `0.000983676774575282` and
   `0.0030345186784249568`.
2. Restore the line. Change `s <= 0.03928` to `s <= 0.05`. The test must go
   red at the 11 input. Wrong value: `0.0033387968190372124`.
3. Restore the line.

Paste the failing assertion output for both runs. The mutation must make
`test/unit/appearance.test.ts` red, not only a type check.

## 2. Remove the non-null assertions (Major)

AGENTS.md line 52 bans non-null assertions. The test uses five: lines 16, 22,
28 and 34 (`formatHexColor(parsed!)`) and line 98
(`parseHexColor("#808080")!`).

Add one local helper after the imports. Use it in those five places:

```ts
function mustParse(value: string): Rgb {
  const color = parseHexColor(value);
  if (color === null) {
    throw new Error(`expected ${value} to parse`);
  }
  return color;
}
```

Import `type Rgb` from the module. Keep each existing assertion. For the four
format tests, `mustParse("#abc")` must still format to `#aabbcc`.

## 3. Prefix every mutation test title (Minor)

The brief requires every title to start `AC-R7-03:` or `AC-R7-04:`
(slice-12-appearance-module-nim.md line 59). Six titles in
`describe("does not mutate its input")` break this rule. Split the block
into two blocks:

- `describe("AC-R7-03: does not mutate its input")` for `parseHexColor`,
  `formatHexColor` and `resolveBackground`.
- `describe("AC-R7-04: does not mutate its input")` for
  `relativeLuminance`, `contrastRatio` and `textColorFor`.

Do not rename the individual tests otherwise. Do not drop a freeze or an
assertion.

## 4. The `#767676` expectation is `#000000` (brief conflict)

The original test instruction asked for `#ffffff` on `#767676`. That is
wrong. Rule 5 picks the higher-contrast colour. Black gives about 4.623:1.
White gives about 4.542:1.

The main brief now states `#000000`. The module and the test already return
`#000000`. Keep that expectation and its test title. Do not change rule 5,
the module or the 4.542 contrast assertion.

## Red evidence

Paste the two threshold runs from finding 1. State that all other tests stay
green in each run. Restore the module line and show `git status --short`
before the commit.

## Done means

- `npm run typecheck` exits 0.
- `npm run test:unit` exits 0. The file has 40 tests.
- `npm run check:acceptance` exits 0 for the same criteria as before.
  AC-R7-01..04 stay `planned`; this fix does not wire the module.
- No non-null assertion remains in `test/unit/appearance.test.ts`.
- Commit on `feature/slice12-appearance`. Do not amend or rebase earlier
  commits. Do not add a package.
