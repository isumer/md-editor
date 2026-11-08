review: deep

# Slice 5 fix 5 — Reserve the Save As path against a concurrent write (send-back of the gate on 770bb54)

Work on branch `bug/slice-5-fix-2` (tip `770bb54`). Run `git merge origin/main`
first. The goals of `slice-5.md` and fix briefs 1-4 still hold. Add no
features. No new dependencies. Commit after each item. Show a red test first
where the item changes behaviour (AGENTS.md).

Base: bug/slice-5-fix-2 (a send-back continues its own PR branch).
Depends on: main only.

## State of the branch
- The gate on candidate `770bb54` found one blocker. This brief covers it.
  Pipeline verify passed and the PR CI is green on that head.
- Do not touch the perf path or its budget: another job owns it.

## Allowed files
- `src/renderer/tabs/documentLifecycle.ts`
- `src/shared/messages/en.ts` (one new key only)
- `test/unit/tabsDocumentLifecycle*.test.ts`
Do not edit `test/e2e/**` (another job owns it), or
`src/renderer/features/preview/preview.ts`, or `src/renderer/workers/**`.

## Items

1. **Blocker — two concurrent Save As calls can both write the same path.**
   `DocumentLifecycle.saveNew` looks up the path index
   (`registry.findByPath(target.canonicalPath)`) and then awaits the write
   (`saveSnapshot`). The write awaits IPC. A second Save As that chooses the
   same not-yet-owned path inside that window passes the same check. Both
   writes run. Both `adoptPath` calls run. One document's bytes overwrite the
   other's, and the path index keeps only the last adopter. Data loss.
   Fix: reserve the canonical path for the whole save.
   - Keep a private set of in-flight canonical paths in `DocumentLifecycle`.
   - In `saveNew`, after the existing owner check and before the write, add
     `target.canonicalPath` to the set. The lookup and the add must run in
     one synchronous block, with no `await` between them.
   - If the path is already reserved: do not write; release `target.grant`;
     show a status message (new key `file.saveInFlight`, text
     "Could not save “{file}”: another tab is saving it. Try again.");
     return `false`. This holds also when the competing save comes from the
     same document (a double Save As trigger).
   - Release the reservation on every exit after it is taken: when the write
     fails (`!name`), when the write throws, and after the adoption succeeds.
     A `try`/`finally` around the awaited write is acceptable.
   - `saveCurrent` adopts no path and needs no reservation.
   - `openReference` and `recoverDraft` re-check the index after their last
     `await` and are safe. Do not change them.
   Tests (tag `AC-R4-02`), in `test/unit/tabsDocumentLifecycleSave.test.ts`:
   - Concurrency, red first: gate `api.saveDocument` with a deferred
     promise. Document A saves as `/race.md`; while A's write is pending,
     document B saves as the same `/race.md`. Assert: B returns `false`;
     `saveDocument` was called once; B's target grant was released; B's
     record is unchanged (path, grant, name); after the deferred resolves,
     A adopts and the index maps `/race.md` to A only; a status message was
     shown. Paste the red run before the fix.
   - A write that fails (`!name`) releases the reservation: a later Save As
     to the same path succeeds.
   - A write that rejects releases the reservation: `lifecycle.save`
     returns `false` through the existing catch, and a later Save As to the
     same path succeeds.

## Done means
- The concurrency test is red before the fix and green after. Paste both.
- Mutations, each pasted with the test that goes red:
  - remove the reservation check: the concurrency test goes red;
  - remove the release on the failed-write path: the failure test goes red;
  - remove the release on the thrown-write path: the throw test goes red.
- `npm run verify` green, and the e2e suite run three times
  (AC-PERF on the Pi is information only; report the numbers).
- No file outside the allowed list changes.
