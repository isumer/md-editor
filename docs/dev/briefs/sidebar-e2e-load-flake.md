review: deep

# workspace-sidebar e2e: 15 s timeouts under CI load — find the stall

Base: main. Branch `bug/sidebar-e2e-load-flake`. No retries, no timeout
raises, no skips, no new dependencies. Follow AGENTS.md. This is an
investigation first; a fix only with a proven cause.

## Problem
`test/e2e/workspace-sidebar.spec.ts` has twice hit the 15 s test budget in
full-suite CI, on two OSes, in two rows, on runs whose diff cannot run
product code:

- windows-latest, run 43027415248: row 71 "a second expand reuses loaded
  children and keeps editing responsive" @AC-R11-02 hit 15 s. The next run
  on the same tree (43028628038) was green. PIPELINE-STATE records this as
  FIX DUE "no brief names it yet"; this brief is that owner.
- macos-latest, run 43057164755: row 112 "the workspace filter keeps
  matching file ancestors" @AC-R11-03 hit 15 s. The same product code was
  green on macOS minutes before (main 9a0e5fe, run 43051059383) and again
  in run 43059756821. Ubuntu AC-R11-03 in the same failing run took 785 ms.

## Facts from the macOS failure artifact
Download: `gh run download 43057164755 -R isumer/solidmd -n failure-macos-latest`.
- The screenshot shows the test's final state: filter "missing" typed,
  "No matching files." visible. Every assertion in the body passed.
- The trace `test.trace` shows the body done about 2.8 s after launch. The
  helper's `Evaluate` and the prompt `Wait for selector` complete, then
  `Close context` starts at +3.7 s and never finishes. The runner killed
  the test 11.4 s after close began.
- So the stall is in app quit, not the sidebar: `application.close()` →
  main's close ask → renderer ack → session write → window close → quit.
  Under runner load one step did not settle inside the remaining budget.

## Questions to answer, with data
1. Which quit step stalls: the close ask (`src/main/app/closeRequests.ts`),
   the session write (`src/main/ipc/session.ts` via the io-worker), the
   window close (`src/main/app/window.ts`), or the quit resume
   (`src/main/app/startup.ts` `before-quit` / `window-all-closed`)? A unit
   probe with an unanswered or slow ack must show the current worst-case
   settle time.
2. What is the ask timeout in `closeRequests.ts`? If it is close to or
   above the 15 s e2e budget, one lost ack is a guaranteed test timeout.
   Name the real worst-case settle time against the budget.
3. Does the AC-R11-02 windows timeout share the quit path, or is it the
   5001-row expand loop? Download the earlier failure artifact
   (run 43027415248) if it is retained; say so if it is not.
4. `closeEditor` (`test/e2e/helpers.ts`) races the close promise against
   prompt visibility and then awaits the close unbounded. State whether a
   helper change (bounded wait, then fail naming the stall) is right. A
   real quit hang must still fail red: a helper that swallows a hang is
   forbidden.

## Rules
- Do not raise the 15 s budget or any timeout, do not add retries, do not
  skip rows.
- Reproduce the MECHANISM with a deterministic unit test first (red), then
  fix, then green. Reproducing the CI flake itself on Linux is not the
  goal; `--repeat-each 10` on `workspace-sidebar.spec.ts` is a regression
  probe, not proof.
- `src/main/app/menu.ts` and `src/preload/preload.ts` belong to the
  windows-save-dirty-flake item: do not touch them.
- If the stall cannot be located from the artifacts and unit probes, write
  the note with ranked candidates and stop; the owner decides.

## Allowed files
- `docs/dev/notes/sidebar-e2e-load-flake.md` (write the note either way).
- `test/e2e/workspace-sidebar.spec.ts`, `test/e2e/helpers.ts`. The
  perf09-ubuntu-flake candidate owns the e2e glob until it lands; if it is
  still unmerged when you need an e2e edit, wait or stop and report.
- `src/main/app/closeRequests.ts`, `src/main/app/window.ts`,
  `src/main/app/startup.ts`, `src/main/ipc/session.ts` — only for a
  proven cause, red test first.
- The existing `test/unit/` files that cover those modules and the
  sidebar/quit e2e rows: extend them, do not rename them.

## Done means
The note names the cause, or ranks candidates with data. Every new test
went red before the fix and is green after. `npm run verify` passes. The
note lists what the next macOS and Windows legs must show; the flake
closes only after several green full-suite runs on both legs.
