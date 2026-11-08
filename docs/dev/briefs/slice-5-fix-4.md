review: deep

# Slice 5 fix 4 — Save As onto a path that another tab holds (send-back of review 946)

Work on branch `bug/slice-5-fix-2` (tip `1e0a0f6`). Run `git merge origin/main`
first. The goals of `slice-5.md` and fix briefs 1-3 still hold. Add no
features. No new dependencies. Commit after each item. Show a red test first
where the item changes behaviour (AGENTS.md). Keep the macOS chords
(`PRIMARY_MODIFIER`, `DOCUMENT_END`, `DOCUMENT_START`) in any new e2e key press.

Base: bug/slice-5-fix-2 (a send-back continues its own PR branch).
Depends on: main only.

## State of the branch
- Pipeline verify passed. Candidate `83a6ac5` was red on CI run 42323452878,
  on macOS AC-PERF-10 only. Job 944 (perf-open-long-task-2) owns that red.
  Do not touch the perf path or its budget in this job.

## Allowed files
- `src/renderer/tabs/documentLifecycle.ts`
- `src/shared/messages/en.ts` (one new key only)
- `test/unit/tabsDocumentLifecycle.test.ts` and new split files
  `test/unit/tabsDocumentLifecycle*.test.ts`
- `test/unit/tabsDocumentCommands.test.ts`, `test/unit/tabsPreviewDocuments.test.ts`
- `test/e2e/tabs.spec.ts`
Do not edit `src/renderer/features/preview/preview.ts` or `src/renderer/workers/**`:
job 944 owns them.

## Items

1. **Blocker — Save As can make two tabs own one file.**
   `DocumentLifecycle.saveNew` (`documentLifecycle.ts`, about line 298) writes
   to the chosen target, then calls `registry.adoptPath`. It never checks
   whether another open document already owns `target.canonicalPath`. Tab A
   "Save As" onto the file open in tab B overwrites B's file on disk. The path
   index then maps the path to A only. A later save of B overwrites A's text.
   Fix: after `chooseSaveTarget`, before any write, look up
   `registry.findByPath(target.canonicalPath)`. If it returns a document with
   another id: do not write; release `target.grant`; keep both documents,
   names, grants, dirty states and path-index entries unchanged; keep the
   current tab active; show a status message (new key in `en.ts`, e.g.
   "<name> is open in another tab. Close it first or choose another name.");
   return `false`. Saving onto the document's own path stays allowed.
   Tests (tag `AC-R4-02`):
   - unit: two open documents; Save As from the first onto the second's
     canonical path. Assert no write call, target grant released, both
     path-index entries unchanged, status shown. Paste the red run before
     the fix.
   - e2e in `tabs.spec.ts`: open two files in two tabs, type in tab A, Save As
     onto B's path (stub the dialog the way the existing Save As e2e does).
     Assert B's disk bytes and B's tab text are unchanged.

2. **Minor — test file size.** `tabsDocumentLifecycle.test.ts` has 415 lines.
   The limit is 400. Split it by topic (e.g. open/close vs save/session).

3. **Minor — test hygiene (re-apply the first-pass fixes of review 946).**
   - `tabsPreviewDocuments.test.ts` about line 39: replace the
     `setTimeout(resolve, 0)` wait with `await Promise.resolve()` or an
     explicit event. No timer waits in unit tests.
   - Test names with wrong criterion ids. Check each against
     `docs/acceptance/R04-*.md` and `R05-*.md` and correct it:
     "focuses a path that is already open" is AC-R4-02, not AC-R4-01;
     "a failed open keeps the current document", "save and save-as ... adopt
     the new path", "unexpected ... failures report status", "cancelled ...
     opens", "save-as cancellation", "saving untitled content adopts a path"
     (all tagged AC-R5-01/AC-R5-03 now); and "publishes the fixed menu ids"
     in `tabsDocumentCommands.test.ts` (tagged AC-R5-20 now). Use the id whose
     Given/When/Then the test proves.

## Deferred (not this job)
- `preview.ts` is at the 400-line limit, and `wireRenderWorker` and
  `wirePreviewLinks` exceed 50 lines. Fix this after job 944 lands.

## Done means
- Item 1 unit test red before the fix, green after (paste both).
- One mutation: remove the new collision check; the unit test goes red.
- `npm run verify` green, and the e2e suite run three times
  (AC-PERF on the Pi is information only; report the numbers).
