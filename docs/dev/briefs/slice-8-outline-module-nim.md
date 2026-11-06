# Slice 8 module part — outline headings (Karen lane)

Base: main
NIM-Model: ultra

A pure module that reads the outline from Markdown source. Slice 8 wires
it into the document map and outline pane later (dev lane). This item adds
no wiring, no IPC and no UI. Criterion AC-R13-01 in
`docs/acceptance/R13-power-tools.md` is planned; do not edit it. No new
dependencies.

## The module
New file `src/shared/outline/outline.ts`. No imports. Exports exactly:
- `export interface OutlineEntry { level: number; text: string; line: number; }`
- `export function outlineHeadings(markdown: string): OutlineEntry[]`

Rules, in this order:
1. `line` is 1-based. Entries keep source order. Do not mutate the input.
2. An ATX heading is up to three leading spaces, then 1 to 6 `#`, then a
   space or the end of the line. Its level is the number of `#`.
3. Remove a closing run of `#` when a space separates it from the text.
   Trim the text. Keep inline code backticks as written.
4. A setext heading is a non-empty text line followed by a line of one or
   more `=` (level 1) or one or more `-` (level 2), each with up to three
   leading spaces. The entry points at the text line.
5. Ignore every line inside a fenced code block. A fence opens with three
   or more backticks or three or more tildes, up to three leading spaces.
   A matching character and at least the opening length closes it. Do not
   nest fences.
6. Skip an empty heading text; do not add an entry.

## Tests (`test/unit/outline.test.ts`)
Every title starts `AC-R13-01:`. Read `test/fixtures/outline/outline.md`
as UTF-8 with `node:fs`.
- `lists the fixture outline` — the exact nine rows of
  `test/fixtures/outline/README.md`: line and level and text
  (1/1, 5/2, 9/3, 13/4, 17/1, 22/2, 26/2, 30/3, 34/2).
- `keeps inline code and Unicode` — entry `Heading with \`inline code\``
  keeps the backticks; `Türkçe başlık` is exact.
- `ignores a heading inside a fenced block` — line 37
  `# not a heading` has no entry.
- `reads setext headings` — a level-1 `=` and a level-2 `-` input give
  the text line and the right level.
- `removes a closing hash run` — `## Title ##` gives text `Title` at
  level 2.
- `ignores a hash run without a space` — `#tag` and `#######` give no
  entry.

Red evidence: run the tests before the module exists (import fails), then
with the fenced-block tracking removed (`ignores a heading inside a fenced
block` goes red). Paste both.

## Allowed files
src/shared/outline/outline.ts, test/unit/outline.test.ts. Nothing else —
no other src file, no fixtures, no acceptance docs, no coverage config, no
workflows.

## Done means
typecheck, check:deps, test:unit, check:coverage exit 0 — paste; list
changed files; paste the red evidence.
