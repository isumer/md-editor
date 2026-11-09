# Slice 9 sync-scroll performance verification

Date: 2026-11-09

## Branch scope

The branch contained only 11 added test lines before this evidence note.

```text
$ git diff --stat origin/main...HEAD
 test/unit/syncScrollMapping.test.ts | 11 +++++++++++
 1 file changed, 11 insertions(+)
```

The branch contained no `src` change.

```text
$ git diff origin/main...HEAD -- src
```

The second command printed no output.

No file outside the module directory imports the module.

```text
$ grep -rn "sync-scroll" src test
test/fixtures/views/README.md:3:`sync-scroll.md` is a committed, deterministic Markdown document for the slice 9 sync-scroll tests: 40 unique headings, each followed by two lines of body text, with a 15-line fenced code block inside `## Heading 20` so a heading also sits below a tall block. Its line numbers are fixed; do not reformat the file.
test/unit/syncScrollMapping.test.ts:9:} from "../../src/renderer/features/sync-scroll/mapping";
```

The import stays in the unit test. The fixture reference is documentation.

## Platform rule

`docs/acceptance/PERF-response-time.md`, lines 74 through 81, defines the platform rule.

Desktop-class GitHub ubuntu, windows, and macOS runners enforce AC-PERF-09, AC-PERF-10, and AC-PERF-11.

The Raspberry Pi precheck reports these rows as information only. It must not block a merge.

The 32 ms and 1 s budgets stay unchanged. This note does not change either budget.

## Gate measurements

Gate 1132 measured two 33.3 ms frames for the AC-PERF-09 20 MB row.

Gate 1132 measured 1,000 ms for the AC-PERF-11 first preview.

Both measurements are information only on this Raspberry Pi host.

The required single rerun used this command on `HEAD`.

```text
$ /opt/pipeline/locked-npm run test:e2e -- test/e2e/preview-perf.spec.ts --grep 'AC-PERF-(09: fling-scrolling the 20 MB|11: a 20 MB)'
AC-PERF-09 20MB render complete after 299523ms
AC-PERF-09 20MB scroll: frames=113 maxFrame=16.8ms frames>32ms=0 longtasks=0 longtaskDurations=[]
AC-PERF-11 20MB open: editable=635ms firstPreview=901ms
2 passed (5.2m)
```

These rerun measurements are information only on this Raspberry Pi host.

## CI evidence

CI run 42562841223 passed every leg for code tip `4ff24c2`.

CI run 42567255770 failed only while downloading Electron. GitHub returned HTTP 504 before tests ran.

Main run 42567341990 failed at the same time and step. GitHub returned HTTP 504 before tests ran.

The new candidate reruns CI on desktop-class enforcing runners.

## Mutation evidence

Gate 1129 recorded four mutations. Each mutation made its named test red.

- The clamp mutation was at `mapping.ts:72`.
- The first-anchor clamp mutation was at `mapping.ts:58`.
- The last-anchor clamp mutation was at `mapping.ts:61`.
- The fourth mutation changed `Math.round` in `sourceLineForPreviewTop`.

Gate 1132 also recorded the `mapping.ts:58` revert. This change adds no mutation.

## Verification

The full locked verification command exited zero.

```text
$ /opt/pipeline/locked-npm run verify
Test Files  92 passed (92)
Tests  964 passed (964)
83 passed (7.5m)
```

The final acceptance check exited zero. AC-R3-01 and AC-R3-02 remain planned.

The module stays unwired until the slice 9 wiring item.
