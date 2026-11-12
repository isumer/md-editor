review: deep

# AC-PERF-02 on macOS — find why the 50 KB keystroke p95 spikes

Base: main. Branch `bug/perf02-macos-spike`. No new features, no new dependencies.
Follow AGENTS.md. Investigation first; a fix only if the cause is proven.
The 50 ms budget stays. No retry, no skip, no platform exemption.

## Problem
AC-PERF-02 (30 keystrokes into the 50 KB document, p95 of `preview-latency`
under 50 ms) is usually p95 17–37 ms on macOS-latest. Rarely a run is red:
- 43127940956 (release/…windows-portable, diff touches only
  `.github/workflows/release.yml` and its unit test, so it cannot change
  renderer timing): 36.3, 32.2, 56.0, 79.9, 45.5, 22.7, 89.3, then mostly
  15–30 with one 69.3. p50 21 ms against a usual 12–15 ms: the whole run is
  slower and the first seven samples are worst.
- 43115369990 (feature/…lowres-4…): 253.5 at sample 8, then 37–95 for a few
  samples.
- 43109111999: a single 71.5 at sample 29.
Ubuntu and Windows do not show it. In the file AC-PERF-02 runs right after the
20 MB AC-PERF-10 open test, and `closeEditor` waits only for the main process.

## Questions to answer, with data
1. During each sample, where does the time go: renderer main thread (LoAF /
   longtask attribution), the render worker, or waiting with an idle renderer
   (GPU process, scheduler)? Add a diagnostic that prints the attribution
   only for samples at or above 50 ms, so a green run stays quiet.
2. When AC-PERF-02 starts, are helper processes of the previous (20 MB)
   application still alive, and what is the load? Log it on macOS.
3. Does the spike follow the previous test? Compare AC-PERF-02 alone, and
   after the 20 MB test, on the macOS CI runner (push the branch; CI is the
   only macOS you have). Cap at about 4 CI runs.

## Fix, only for a proven cause
- If leftover processes of the previous app cause it: `closeEditor` waits
  for the whole application process tree to exit (all suites benefit).
- If it is app work right after open (deferred features, fill, code cache):
  fix the app so the work does not land on the keystroke path, or have the
  test wait for a documented "open settled" signal the app exposes.
- If the time is outside the app (runner), show the trace and stop: write the
  finding in the note; do not change the budget.

## Done when
- The cause is named with trace or log evidence in the PR note.
- The diagnostic stays (quiet when green).
- AC-PERF-02 stays at 50 ms and is green on all three platforms.
