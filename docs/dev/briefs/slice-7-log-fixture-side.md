# Side — Slice 7 large log fixture generator (20 MB)

**Base: main.** Runs alongside the development lane. This task touches only
`test/fixtures/log/**`, so it is file-disjoint from slice 5 (`src/**`,
`test/unit/**`, `test/e2e/**`), slice 4 fix 2 (`src/renderer/**`, preview
tests) and the Karen stability fixtures (`test/fixtures/stability/**`).

Slice 7 (PLAN "Slices" §7) must keep the keystroke budget on a 20 MB `.log`
file. AGENTS.md says large fixtures are generated deterministically at test
time, never committed. This task adds the generator that makes that file.

## Deliverables (all under `test/fixtures/log/`)
- `generate-log.mjs` — a plain Node script, no dependencies, run as
  `node generate-log.mjs <path> [bytes]`. It must:
  - write one plain-text log file at `<path>`; create missing parent
    directories, but never write outside `<path>`;
  - default `bytes` to `20971520` (20 MB). Reject a missing path, a
    non-positive integer, an extra argument, or an existing file, with a
    plain message on stderr and exit code 2 — never a stack trace;
  - produce the same bytes for the same `bytes` value every run: use a
    fixed seed and no clock or randomness from the environment;
  - write LF line endings only and ASCII characters only;
  - write whole log lines (`2026-01-01T00:00:00.000Z INFO module event
    key=value`) until the size is at least `bytes`. The size must not exceed
    `bytes` + 4096. Print the exact byte count and the path.
- `README.md` — name the script, give the exact command, the default size,
  the determinism rule, and say that slice 7 calls it with a temp path and
  that no large log is committed.

## Verify
- Run `node test/fixtures/log/generate-log.mjs <tmp-1>` and the same command
  to `<tmp-2>` in separate temp dirs. Paste `wc -c` and `sha256sum` for both
  files. The sizes and digests must match.
- Paste `head -3 <tmp-1>`.
- Negative control: run it on an existing file and with count `0`; paste the
  two plain messages and exit codes.
- `npm run verify` stays green (fixture-only; negative control is that the
  existing tests run unmodified).
- Remove the temp files afterwards.

## Allowed files
`test/fixtures/log/**` only. Nothing else — no src, no test/unit, no
test/e2e, no docs, no `.gitignore`, no coverage config, no workflows.

## Done means
list changed files; paste both generation runs, both sizes and digests; paste
the three log lines; paste the negative-control output; paste `npm run
verify` output.
