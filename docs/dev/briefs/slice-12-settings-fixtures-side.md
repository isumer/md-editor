# Side — Slice 12 settings fixtures (corrupt, partial, unknown keys, old version)

**Starts from `main`** and runs alongside the current slice. File-disjoint from
every queued or running slice: this task touches only
`test/fixtures/settings/**` (slice 4 fix and slice 5 touch `src/**` and
`test/**`, the export task touches `test/fixtures/export/**`, the views task
`test/fixtures/views/**`, the binary task `test/fixtures/binary/**`).

Slice 12 ("Themes + colours + settings", PLAN "Slices" §12) needs deterministic
settings documents to prove: settings survive restart, a corrupt settings file
loads defaults, unknown keys are preserved, and old schemas migrate. This task
commits those documents so slice 12's tests assert exact outcomes instead of
building settings files inline.

docs/architecture.md §11 fixes the rules: a versioned settings schema with
defaults and a validator, unknown keys preserved, pure migrations tested both
ways. The fixture file names and the JSON below are the committed inputs; if
slice 12's schema differs, slice 12's brief updates these fixtures and says so.

## Deliverables (all under `test/fixtures/settings/`)
- `README.md` — one short paragraph (what the fixtures are for, that they are
  committed and deterministic), then a table with one row per file: what the
  file contains and what a settings test must assert for it.
- `complete.json` — a valid version-1 document with every top-level key the
  settings tests will exercise: `version`, `theme`, `fontSize`,
  `preview.scrollSync`, `editor.wrap`, `editor.tabSize`,
  `encoding.default`, `encoding.lineEndings`, `ignore` (array of folders).
  Values are plausible any-editor values; the point is that the shape is
  exact, not that these are the product defaults.
- `partial.json` — valid JSON with only `theme` present; a test must assert the
  remaining settings take their defaults, not `undefined`.
- `unknown-keys.json` — a valid document plus `"futureOption"` (object) and
  `"futureFlag"` (boolean); a test must assert both survive a load → save
  round trip unchanged.
- `corrupt-truncated.json` — an object cut off mid-member (not parseable).
- `corrupt-array.json` — a parseable JSON array where an object is required.
- `empty.json` — a zero-byte file.
- `version-old.json` — `"version": 0` with the one key the planned migration
  renames (README names it); a test must assert the migration maps it and that
  the reverse direction (an older build reading version 1) keeps the file
  readable, per architecture §11.

All files: plain ASCII, LF only, no BOM, each under 2 KB, no comments (JSON
cannot carry them). Do not invent extra files; do not touch the root
`.gitattributes` or `.gitignore`.

## Verify
- Paste `find test/fixtures/settings -type f | sort` and the content of each
  file.
- Negative control: `node -e` (or `python3 -I -c`) parse each JSON file:
  `complete.json`, `partial.json`, `unknown-keys.json` and `version-old.json`
  parse and have the documented keys; `corrupt-truncated.json`,
  `corrupt-array.json` and `empty.json` fail to parse. Paste both results.
- `file test/fixtures/settings/*` reports ASCII text (not CRLF) for every file.
- `npm run verify` stays green (fixture-only change; the negative control is
  that the suite runs the existing tests untouched).

## Allowed files
test/fixtures/settings/** only. Nothing else — no src, no test/unit, no
test/e2e, no docs, no coverage config, no workflows.

## Done means
list files (`find` output); paste every fixture's content; paste the parse
negative control for the good and the corrupt files; paste `file` output; paste
`npm run verify` output.
