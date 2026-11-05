# Slice 7 module part — language selection (Karen lane)

Base: main

A pure module that selects the `highlight.js` language id for a file path.
Slice 7 wires it into the editor later (dev lane). This item adds no
wiring, no IPC and no UI. Criterion AC-R12-02 in
`docs/acceptance/R12-text-editing.md` is planned; do not edit it.
No new dependencies.

## The module
New file `src/shared/text/language.ts`. No imports. Exports exactly:
- `export const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>>`
- `export function languageForPath(path: string): string | undefined`

`docs/languages.md` is the source of truth. Read its table. Every id and
every extension must match it exactly. A map key is the extension in
lower case without the dot. A map value is the exact id.

Rules, in this order:
1. Use the final path segment only. Split on `/` and on `\`.
2. If that segment equals `Makefile` in any case, return `makefile`.
3. Find the last dot in the segment. If there is none, return `undefined`.
4. If the dot is the first character or the last character, return
   `undefined`.
5. Look up the lower-case text after the dot and return its id, or
   `undefined` when the table does not list that extension.
6. Do not read the filesystem and do not mutate inputs.

The two collisions in the table must hold: `.sh` is `bash` (not `shell`),
and `.php` is `php` (not `php-template`).

## Tests (`test/unit/language.test.ts`)
Every title starts `AC-R12-02:`.
- `maps every extension in docs/languages.md to its id` — read the doc with
  `node:fs`, parse only the table rows, take every backticked extension
  that starts with a dot, and assert the map has exactly those keys, each
  with its row's id. The `Makefile` name in the Makefile row is not an
  extension.
- `maps a full path by its last extension` — `/a/b/notes.md` gives
  `markdown`, `C:\notes\Main.PY` gives `python`, `x.tar.gz` gives
  `undefined`.
- `maps Makefile without an extension` — `Makefile`, `makefile` and
  `/dir/Makefile` give `makefile`.
- `ignores dotfiles and trailing dots` — `.gitignore`, `.md` and `notes.`
  give `undefined`.
- `returns undefined for an unknown extension` — `notes.zzz` gives
  `undefined`.

Red evidence: run the tests before the module exists (the import fails).
Then remove rule 4's first-character check and paste the red dotfile
test. Restore the rule.

## Allowed files
`src/shared/text/language.ts`, `test/unit/language.test.ts`. Nothing else —
no other src file, no fixtures, no acceptance docs, no coverage or lint
config, no workflows, no package.json.

## Done means
List changed files. Paste the red evidence. Paste the summaries for
typecheck, check:deps, test:unit and check:coverage. Plain ASCII with LF
endings.
