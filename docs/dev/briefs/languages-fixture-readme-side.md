# Side — languages fixture README

**Base: main.** Docs only. This task adds one README and changes nothing
else.

`docs/languages.md` is the source of truth for the 36 languages, their
`highlight.js` ids and their extensions. The 36 fixtures in
`test/fixtures/languages/` are checked in, but no README explains which
table row each file proves. Write that README so a reviewer can check a
fixture without reading the table.

## Deliverable
New file `test/fixtures/languages/README.md` only.
- State that `docs/languages.md` is the source of truth and that each
  fixture is named `<id>.<primary extension>`.
- One table row per fixture file: file name, language id, primary
  extension, and the expected highlight result. Use the table's example
  comment and keyword text, and name the token class each produces:
  `comment` and `keyword` unless a footnote in `docs/languages.md` gives a
  different class.
- For the five footnoted rows, state the exact footnote result: Markdown
  heading gives `section`, Diff hunk header gives `meta`, INI/TOML section
  header gives `section`, YAML `true` gives `literal`, and Plain text
  produces no tokens.
- State that the first extension in each `docs/languages.md` row is the
  primary one and selects the fixture.
- State that no test drives these fixtures yet; slice 7 will highlight each
  one through the editor.

Do not change a fixture, code, test or `docs/languages.md`.

## Verify
- List the new file.
- Check 36 fixtures exist: `ls test/fixtures/languages | wc -l`.
- `npm run verify` stays green (docs only).

## Allowed files
`test/fixtures/languages/README.md` (new file only). Nothing else — no
fixture data, no src, no test/unit, no test/e2e, no other fixture folder,
no docs, no coverage config, no workflows.

## Done means
List changed files. Paste the fixture count. Paste `npm run verify`
output. Plain ASCII with LF endings; no new dependency.
