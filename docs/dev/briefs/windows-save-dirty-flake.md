review: deep

# Windows e2e: a menu Save never completes (AC-R5-02) — find the race

Base: main. Branch `bug/windows-save-dirty-flake`. No new features, no new
dependencies, no retries. Follow AGENTS.md. This is an investigation
first; a fix only with a proven cause.

## Problem
CI run 43027920870 (windows-latest, full e2e):
`test/e2e/editor.spec.ts:197` "saves edits atomically and clears the dirty
marker" @AC-R5-02 failed once on a candidate whose diff cannot run
product code (release.yml + a unit test). The same runtime code passed on
Windows minutes later (main 67322cc, run 43028554578), and eight other
full-suite Windows runs of the same code at 13:23 UTC were green. A
flaky test is a defect: find the race, fix it in code, never retry into
green.

## Facts from the failure artifact
Download: `gh run download 43027920870 -R isumer/solidmd -n failure-windows-latest`.
- The typed text landed in the right document; the preview showed it
  (failure screenshot).
- The title showed "•" before the menu click (line 213 passed).
- `Menu.getApplicationMenu()!.getMenuItemById("file-save")!.click()`
  returned in about 3 ms.
- `expect.poll(readTextOrNull(copiedFile))` never saw the text (2 s).
- At teardown the close prompt still offered Discard: the document was
  still dirty about 3.3 s after the click. The save never ran or never
  finished; a slow write is not the whole story.
- The failure screenshot shows no error message anywhere.

## Chain to inspect (click to disk)
1. `src/main/app/menu.ts` — contributed item `click` sends
   `menu:command` to `getMainWindow()`. Can the send be lost (window
   state, rebuild replacing the item between menu open and click)?
2. `src/preload/preload.ts` `onMenuCommand` — registered when
   DocumentCommands constructs, which also publishes the contribution;
   confirm no window where main has the item but the listener is gone.
3. `src/renderer/tabs/documentCommands.ts` `runMenu` —
   `void this.commands.run(...)` has no catch: a rejection there shows
   nothing and leaves the document dirty. `file.save` has no `when`
   guard. Prove with a test what a rejected run does.
4. `src/renderer/tabs/documentLifecycle.ts` save path — saveCurrent →
   saveSnapshot → saveReplicatedDocument (OUT_OF_SYNC attach + one
   retry) → markSaved. Which failure path returns with no status
   message and keeps the dirty marker?
5. The io-worker write (atomicWrite) on Windows: rename over a file held
   by antivirus. Does every failure here reach `value`/`unexpected` and
   the user, or can one hang without settling?

## Rules
- The race was not seen on Linux; do not spend the job on Linux
  reproduction of the flake itself. Reproduce the MECHANISM with a
  deterministic unit test first (red), then fix, then green
  (candidates: `test/unit/tabsDocumentCommands.test.ts`,
  `test/unit/tabsDocumentLifecycleSave.test.ts`).
- `--repeat-each 10` on `editor.spec.ts` (Linux) is a regression probe,
  not proof of a Windows fix.
- Do not raise timeouts, do not add retries, do not skip the test.
- `test/e2e/**` is off-limits: the running perf09-ubuntu-flake item owns
  the glob. If the right fix needs `editor.spec.ts` or `helpers.ts`,
  stop and report; that part moves after perf09 lands.
- If the cause is outside our control (runner behaviour), write the
  numbers and stop; the owner decides.

## Allowed files
- `docs/dev/notes/windows-save-dirty-flake.md` (write the note either way).
- `test/unit/tabsDocumentCommands.test.ts`,
  `test/unit/tabsDocumentLifecycleSave.test.ts`,
  `test/unit/menu.test.ts`, `test/unit/commands.test.ts`.
- `src/renderer/tabs/documentCommands.ts`,
  `src/renderer/tabs/documentLifecycle.ts`, `src/main/app/menu.ts`,
  `src/preload/preload.ts` — only for a proven cause, red test first.

## Done means
The note names the cause, or ranks candidates with data. Every new test
went red before the fix and is green after. `npm run verify` passes. The
note lists what the next Windows legs must show; the flake closes only
after several green Windows runs.
