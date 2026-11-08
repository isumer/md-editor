# Slice 14 side — update feed fixtures (side lane)

Base: main

Deterministic fixtures for the update checks in slice 14. The module is
on main at `src/shared/update/updatePolicy.ts` and is the source of truth
for the expected results below: `parseReleaseFeed` returns the tag text
unchanged, so accepted tags keep their `v`; `parseChecksum` takes a
digest alone. This item adds test data and a README only. It adds no
test, no module and no network access. No new dependencies.

The expectations in this brief were corrected on 2026-11-08 after the
gate on candidate `3a68ea1`; the fix is `slice-14-update-feed-fixtures-fix.md`.

## Allowed files
New files only under `test/fixtures/update/`:
- `feed-ok.json`
- `feed-prerelease.json`
- `feed-extra-key.json`
- `feed-missing-body.json`
- `feed-bad-url.json`
- `feed-bad-version.json`
- `feed-array.json`
- `checksums.sha256`
- `README.md`

Change no other file.

## The files
Write every file as ASCII with LF line endings and one final newline.
Use these exact values.

1. `feed-ok.json` — an object with exactly three keys:
   `"tag_name": "v1.4.2"`,
   `"html_url": "https://github.com/isumer/md-editor/releases/tag/v1.4.2"`,
   `"body": "Update to 1.4.2.\n\n- Faster preview\n- Fixed save"`.
2. `feed-prerelease.json` — the same keys with
   `"tag_name": "v1.4.2-beta.1"` and a one-line `"body"`.
3. `feed-extra-key.json` — the keys of `feed-ok.json` plus
   `"draft": false`.
4. `feed-missing-body.json` — `tag_name` and `html_url` only.
5. `feed-bad-url.json` — `"html_url": "http://example.invalid/notes"`.
6. `feed-bad-version.json` — `"tag_name": "1.4"`.
7. `feed-array.json` — a JSON array that holds one copy of the accepted
   object.
8. `checksums.sha256` — exactly two lines:
   `sha256:fd98e55766de54376fcb4e55b61b0ea1cafbe1b12ddf748ac3835c7ed541254e`
   `7E0BE9FE042AFE8855D8C2CF6FA8D6ABED6D56D24F62689498FD3A07EF12EB12`
   The second line is upper case on purpose. Do not add an artifact file
   name after a digest: `parseChecksum` accepts the digest alone.

## README.md
Say that the files are static test data for the update checks. List a
table with one row per file and its expected result, using the module
rules:
- `feed-ok.json` → accepted; version `v1.4.2`, URL
  `https://github.com/isumer/md-editor/releases/tag/v1.4.2`, body as
  stored.
- `feed-prerelease.json` → accepted; version `v1.4.2-beta.1`.
- `feed-extra-key.json` → rejected: an extra key.
- `feed-missing-body.json` → rejected: a missing key.
- `feed-bad-url.json` → rejected: the URL does not start with
  `https://`.
- `feed-bad-version.json` → rejected: the tag has two numeric parts.
- `feed-array.json` → rejected: the value is an array.
- `checksums.sha256` lines 1 and 2 → accepted; both return the same 64
  digits in lower case.
Add one line: a checksum with 63 digits, a wrong algorithm and a
non-string are rejected, and no file for those exists on purpose. A
complete manifest line with a trailing file name is also rejected:
`parseChecksum` takes the digest alone.

## Checks
- Every `.json` file parses: run `node -e` with a loop over the files and
  paste the output.
- `checksums.sha256` has two lines and 64 hex digits after an optional
  `sha256:` prefix: paste a `node -e` check.
- Paste `ls -l test/fixtures/update` and the first line of each file.

## Done means
The files exist, both checks pass, and no other file changed. List the
changed files.
