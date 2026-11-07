review: deep

# Slice 8 part - Markdown table formatter module

Base: main

A pure module that aligns one Markdown pipe table. Slice 8 wiring finds
the table block, calls this module and replaces the block later. This
item adds no menu command, no editor wiring and no UI. AC-R13-07 stays
`planned`. No new dependencies.

Parts: this module part only. Depends on: main. Nothing waits for it.

## Allowed files
New files only:
- `src/shared/format/tableFormat.ts`
- `test/unit/tableFormat.test.ts`

Change no other file. `src/shared` modules have zero imports, so
`tableFormat.ts` imports nothing.

## API
Export exactly this function from `tableFormat.ts`.

```ts
export function formatTable(lines: readonly string[]): string[];
```

`lines` is one table block: the header row, the delimiter row and zero or
more body rows. It has no surrounding text and no trailing newline. The
function returns a new array of formatted lines. It never changes the
input.

## Rules

### Split a row into cells
1. Trim spaces and tabs from both ends of the line.
2. If the result starts with `|`, drop that one character.
3. If the result ends with `|` and that pipe is not escaped, drop that one
   character. A pipe is escaped when an odd number of backslashes comes
   directly before it.
4. Split the rest at each pipe that is not escaped. A pipe is a separator
   when an even number (including zero) of backslashes comes directly
   before it.
5. Trim spaces and tabs from both ends of every cell. Keep an escaped
   pipe as the two characters `\|` inside its cell.

### Validate
1. `lines` must have at least two entries. Otherwise throw
   `new Error("table needs a header and a delimiter row")`.
2. Every trimmed delimiter cell must match `/^:?-+:?$/`. Otherwise throw
   `new Error("invalid delimiter row")`.
3. The header row and every body row must have the same cell count as the
   delimiter row. Otherwise throw
   `new Error("table row has the wrong number of cells")`.

### Widths and alignment
1. A column's width is the largest of: 3, the header cell length, and every
   body cell length in that column. Length means `String.prototype.length`
   (UTF-16 code units).
2. The delimiter cell gives the alignment: a leading and a trailing `:`
   is center, a leading `:` alone is left, a trailing `:` alone is right,
   and neither is none.
3. The output delimiter cell is:
   - none: `"-".repeat(width)`
   - left: `":" + "-".repeat(width - 1)`
   - right: `"-".repeat(width - 1) + ":"`
   - center: `":" + "-".repeat(width - 2) + ":"`

### Output
1. Every row, including the delimiter row, is
   `"| " + cells.join(" | ") + " |"`.
2. Header and body cells are left-aligned and padded on the right with
   spaces to the column width. Do not pad on the left and do not use the
   alignment for body cells.
3. Return a new array with the same line count as the input.
4. Formatting the output again returns an equal array.

## Tests (`test/unit/tableFormat.test.ts`)
Every title starts `AC-R13-07:`. Use exact expected values.
- `aligns every column to its widest cell` - a three-column table with
  short and long header and body cells. Assert the exact six output lines,
  including both spaces around every `|` and the trailing padding.
- `keeps each column's alignment` - four columns with header and body
  cells that make the widths 3, 4, 5 and 6. The delimiter row has none,
  left, right and center in that order. Assert the exact delimiter line:
  `---`, `:---`, `----:` and `:----:`.
- `pads to the three-character minimum` - header `| a | b |`, delimiter
  `| - | - |`, no body rows. Assert both delimiter cells are `---`.
- `keeps an escaped pipe inside its cell` - `| a \| b | c |` is one row
  with two cells. Assert the output row has two cells and the first cell
  text is `a \| b`.
- `accepts rows without outer pipes` - `a | b` and `--- | ---` produce
  rows that start with `| ` and end with ` |`, and the columns still
  align with a header that has outer pipes.
- `formats the output again to the same lines` - format a mixed table
  once, format the result again, assert the two results are equal.
- `rejects an invalid table` - one line only, a delimiter cell of `""`,
  `"a"` or `"::"`, a header with two cells and a body row with one, and a
  body row with three. Assert the exact error messages.
- `does not change its input` - freeze the input array and its strings;
  the result is a different array and the input still matches.

Red evidence: break rule "widths and alignment" 1 (use width 0), rule
"split a row into cells" 4 (split at every pipe) and rule "widths and
alignment" 3 (use `":" + "-".repeat(width)` for center) once each.
Confirm a test goes red for each, then restore the line. Paste all three
runs.

## Done means
`npm run typecheck`, `npm run check:deps` and `npm run test:unit` exit 0
- paste. Coverage thresholds stay as they are. List changed files. Paste
the red evidence. Do not change the coverage baseline, acceptance files
or workflows.
