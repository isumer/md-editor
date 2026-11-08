# Slice 14 side fix — update feed fixture expectations (send-back of the gate on 3a68ea1)

Work on branch `feature/slice14-update-feed-fixtures`. The goals of
`slice-14-update-feed-fixtures-side.md`, as amended on main, still hold.
This item corrects the two false expected results in the fixture README
and the checksum fixture itself. It adds no feature, no file and no test.
No new dependencies. Commit once, after the checks below pass.

Base: feature/slice14-update-feed-fixtures (a send-back continues its own
PR branch).
Depends on: main only.

## Base race
If a lane starts you on another branch from origin/main, merge
`origin/feature/slice14-update-feed-fixtures` into it (no rebase, no
force-push). The branch name alone is not a scope finding at the next
review.

## Why (gate report 947)
The module on main is the source of truth. `parseReleaseFeed` returns
the tag text unchanged, so the accepted tag `v1.4.2` gives the version
`v1.4.2`; its merged test `AC-R9-07: returns version, URL and notes from
an accepted feed` in `test/unit/updateFeed.test.ts` pins `v1.2.3` for a
`v1.2.3` tag. `parseChecksum` (`src/shared/update/updatePolicy.ts`)
accepts only an optional `sha256:` prefix followed by exactly 64 hex
digits; a line that also carries an artifact file name after the digest
is rejected. The README claimed the opposite of both, and the checksum
file held two lines the module rejects.

Do not change `src/shared/update/updatePolicy.ts` or any test under
`test/unit/`: another item owns that module and it is already on main.
Do not add a committed test: this item owns test data only. The proof
below uses a throwaway probe and deletes it.

## Allowed files
- `test/fixtures/update/README.md`
- `test/fixtures/update/checksums.sha256`

Change no other file. All JSON fixture files stay byte-for-byte as they
are; their values are correct.

## Item 1 — README version rows
In the `feed-ok.json` row (currently line 11), the expected version is
`v1.4.2`.
In the `feed-prerelease.json` row (currently line 12), the expected
version is `v1.4.2-beta.1`.
Keep the rest of both rows. Both tags stay as they are; only the
expected result changes.

## Item 2 — checksum fixture and its row
Write `test/fixtures/update/checksums.sha256` as exactly two lines with
one final newline:
```
sha256:fd98e55766de54376fcb4e55b61b0ea1cafbe1b12ddf748ac3835c7ed541254e
7E0BE9FE042AFE8855D8C2CF6FA8D6ABED6D56D24F62689498FD3A07EF12EB12
```
The digests are unchanged. The artifact file names are removed because
`parseChecksum` takes the digest alone. The second line stays upper case
on purpose; both lines return their 64 digits in lower case.

In the README table row for `checksums.sha256` (currently line 18),
keep "Two lines: one `sha256:` line and one bare line." and keep "Lines 1
and 2 are accepted; both return the same 64 digits in lower case."

Replace the closing paragraph (currently lines 20-21) with:
`A checksum with 63 digits, a wrong algorithm and a non-string are
rejected, and no file for those exists on purpose. A complete manifest
line with a trailing file name is also rejected: `parseChecksum` takes
the digest alone.`

Keep ASCII and LF endings. Wrap the README at 79 columns like the
current file.

## Checks (paste each output)
1. Red first, on the unmodified branch: create a throwaway
   `test/unit/tmp-update-fixture-probe.test.ts` that imports
   `parseReleaseFeed` and `parseChecksum` from
   `../../src/shared/update/updatePolicy`, reads each fixture file, and
   asserts the corrected expected results. Run
   `npx vitest run test/unit/tmp-update-fixture-probe.test.ts` and paste
   the four failures (two versions, two checksum lines). Delete the file.
2. Green after the fix: recreate the same probe, run it, paste
   `4 passed`. Delete it and paste `git status --short`.
3. `node -e` loop over the JSON files that prints each parse result.
4. `ls -l test/fixtures/update` and the first line of each file.
5. `git diff --stat origin/main...HEAD` names exactly the nine fixture
   files from the base item; the JSON files show no change since the
   candidate commit.

## Done means
- The README states `v1.4.2` and `v1.4.2-beta.1`; `checksums.sha256` is
  two digest-only lines; the probe accepts all four rows.
- No file outside the two allowed files changed in this fix commit. No
  src change, no committed test, no probe left behind.
- Paste the red run, the green run, the diff stat and `git status`.
