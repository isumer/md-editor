# Slice 8 user bindings fix - three rules accept illegal input (dev lane)

Base: main (continues the PR branch feature/slice8-user-bindings)

The Vision gate on candidate 759de95 found three edge cases. The module
accepts input that the brief forbids. Fix the module and add one exact
regression test for each case. Keep every other rule as it is.
AC-R13-05 stays `planned`. Do not add wiring, IPC or dependencies.

## Findings

1. Major - `src/shared/keymap/userBindings.ts:100`. The Windows check
   uses `normalized.startsWith("Mod-Alt-")` and then measures the rest.
   A chord with another modifier between them escapes the check.
   `Mod-Alt-Shift-q` normalises to `Mod-Alt-Shift-q`; the rest is
   `Shift-q`, length 5, so the chord is bound. Resolve rule 3 says: on
   `win32`, a normalised chord with both `Mod` and `Alt` whose key is
   one character is `unreachable-chord`. The gate proved it with an
   exact assertion: the binding was installed.
2. Major - `src/shared/keymap/userBindings.ts:25`. The key check
   rejects only the space, tab, newline and carriage return characters.
   Chord rule 2 says the key must not be whitespace. Other whitespace
   passes: `Mod-\v` (vertical tab), `Mod-\f` (form feed) and
   `Mod- ` (no-break space) all bind. The gate proved it: a
   temporary assertion returned `"Mod-\v"`.
3. Major - `src/shared/keymap/userBindings.ts:83`. The table check
   accepts every value that is not `null` and not an array. `new
   Date(0)` and `new Map()` are objects, so they pass and report no
   `invalid-table` problem. Resolve rule 2 says the table must be a
   plain object. The gate proved it with a `new Date(0)` case.

## Module change

Keep the exports, the zero imports, the problem order and the frozen
results. Change only these three checks.

1. AltGr check. Read the normalised chord itself, not a prefix.
   Split it on `-`. The last part is the key; the other parts are the
   modifiers. The chord is unreachable on `win32` when the modifier set
   contains both `Mod` and `Alt` and the key has one character.
   Examples on `win32`:
   - `Mod-Alt-q`, `Mod-Alt-Shift-q`, `Shift-Mod-Alt-Q` and
     `Mod-Meta-Alt-q` are `unreachable-chord`.
   - `Alt-Shift-q` stays bound (no `Mod`).
   - `Mod-Alt-F5` stays bound (the key has five characters).
2. Whitespace check. Reject a one-character key when the character
   matches `\s`. Use the same `/\s/u` rule that the command value check
   already uses at line 116. Keep the `-` rejection.
3. Plain-object check. A plain object has `Object.prototype` or `null`
   as its prototype. Reject every other object, including instances of
   `Date`, `Map`, `RegExp` and a class. Keep the existing rejection of
   `null`, arrays and non-objects.

## Tests (`test/unit/userBindings.test.ts`)

Add three tests. Each `it` title starts `AC-R13-05:`. Use exact
`toEqual` values.

1. `AC-R13-05: reports one-character AltGr chords with any modifiers`.
   - `resolveUserBindings({}, { "Mod-Alt-Shift-q": "cmd" }, "win32")`
     gives bindings `{}` and problems
     `[{ chord: "Mod-Alt-Shift-q", reason: "unreachable-chord" }]`.
   - `{ "Shift-Mod-Alt-Q": "cmd" }` gives the same (proves any order).
   - `{ "Mod-Meta-Alt-q": "cmd" }` gives the same (proves any modifier
     set).
   - `{ "Alt-Shift-q": "cmd" }` on `win32` gives
     `{ "Alt-Shift-q": "cmd" }` and no problems.
2. `AC-R13-05: rejects every whitespace key`.
   `normalizeChord("Mod-\v", "linux")`, `normalizeChord("Mod-\f",
   "linux")` and `normalizeChord("Mod- ", "linux")` each return
   `null`. `resolveUserBindings({}, { "Mod-\v": "cmd" }, "linux")`
   gives bindings `{}` and problems
   `[{ chord: "Mod-\v", reason: "invalid-chord" }]`.
3. `AC-R13-05: rejects tables that are not plain objects`.
   `new Date(0)`, `new Map()` and `new (class Table {})()` each give
   the defaults and `[{ chord: "", reason: "invalid-table" }]`.
   `Object.assign(Object.create(null), { "Mod-k": "cmd" })` gives
   `{ "Mod-k": "cmd" }` and no problems. This proves both sides of the
   prototype check.

## Red evidence

Paste all runs.

1. Add the three tests first, with the module unchanged. Run the test
   file. The three new tests must fail and the other nine must pass.
   Paste the run.
2. Apply the three module fixes. The whole file passes. Paste the run.
3. Mutate each fix once and confirm its test goes red:
   - restore the `startsWith("Mod-Alt-")` prefix check: test 1 fails.
   - remove the `\s` key rejection: test 2 fails.
   - accept every non-array object: test 3 fails.
   Restore each line. Paste the three runs.

## Formatting

ASCII only, LF endings, a final newline, double quotes like the
neighbouring code. Comments say why in one or two lines.

## Allowed files

- `src/shared/keymap/userBindings.ts`
- `test/unit/userBindings.test.ts`

Change no other file. Do not change the coverage baseline, the
acceptance files or the workflows.

## Done means

- The fix commit changes only the two files above. Check
  `git diff --stat HEAD~1..HEAD`. The diff against `origin/main...HEAD`
  names both files because this branch continues the unmerged PR: that
  is not a scope finding.
- `npm run typecheck`, `npm run check:deps` and `npm run test:unit`
  exit 0. Paste their summary lines.
- Run `npm run verify` when the Electron lock is free. Do not wait
  more than 10 minutes for it. If AC-PERF-09 fails on this machine,
  note the number and move on.
- Commit on the PR branch. Do not amend or rebase existing commits.
