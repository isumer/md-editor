# macOS perf failures on a fresh CI runner

## Finding (diag run 43250118484, macos-latest, one machine, two passes)

| | cold pass (first Electron launches on the machine) | warm pass (same machine, a minute later) |
|---|---|---|
| first launch, start → argv document | 4157 ms | 1286 ms |
| AC-PERF-03 elapsed (budget 2000 ms) | 1852 ms; main runs failed at 2085–2231 ms | 977 ms |
| AC-PERF-02 p95 (budget 50 ms) | 106.7 ms (samples 1 and 3: 106.7, 123.7) | 20.6 ms |

Each test launches its own app with a fresh profile in both passes, so the
difference is in the machine, not in the app: on first exec the OS assesses each
new binary and Electron helper app, pages in the framework, and builds its
system-wide GPU shader cache. Main turned red on macOS when #85 moved the perf
specs to run first, on that untouched machine; before #85 they ran after the
rest of the suite and passed.

The cold AC-PERF-03 timeline (ms from the test's start): process start +358,
main boot +438, app ready +663, BrowserWindow constructed +958, renderer
editable +1320, typing accepted +1852. The warm pass shows the same phases at
roughly half the cost.

## Decision

`test/e2e/global-setup.ts` launches the real app before any test, at least
twice and until two rounds in a row agree within 25 % (at most six),
through the path the perf specs use (argv open of the 50 KB fixture, preview,
typing), and measures nothing. The perf specs still run first, before the rest
of the suite (the #85 intent). No budget, sample count, test or retry setting
changes. It replaces the earlier `electron --version` prewarm, which never
started a window, renderer or helper process.

Verification run 43253195712 (three fresh macos-latest runners, two fixed
rounds): AC-PERF-03 and AC-PERF-02 passed on all three. One slow runner was
still settling (rounds 11.7 s and 4.6 s, against about 2.5 s on round two
elsewhere) and missed AC-PERF-11, so rounds now repeat until the machine is
steady.

## What would reverse this

A cold-start criterion for the first launch after install. That is an OS cost
on an unsigned binary, so it needs a signed and notarized build measured on a
real Mac, not this suite.
