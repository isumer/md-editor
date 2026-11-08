# Slice 5 fix 6 — Release the open grant when a save-as holds the path (send-back of the gate on 89face4)

Work on branch `bug/slice-5-fix-5` (tip `89face4`). Run `git merge origin/main`
first. The goals of `slice-5.md` and fix briefs 1-5 still hold. Add no
features. No new dependencies. Commit after each item. Show a red test first
(AGENTS.md).

Base: bug/slice-5-fix-5 (a send-back continues its own PR branch).
Depends on: main only.

## Base race
If a lane starts you on another branch from origin/main, merge
`origin/bug/slice-5-fix-5` into it (no rebase, no force-push). The branch
name alone is not a scope finding at the next review.

## State of the branch
- The gate on candidate `89face4` found one blocker. This brief covers it.
  Two other gate findings do not hold. Do not act on them:
  - The Pi perf e2e rows are information only. CI on `89face4` is green on
    ubuntu, windows and macOS (push run 42450852058).
  - The 88-file diff against main is the slice-5 PR body; main does not hold
    that PR yet. The fix commit `ffe755f` touches the three allowed files
    only.
- Do not touch the perf files, `test/e2e/**`, `src/renderer/features/preview/preview.ts`
  or `src/renderer/workers/**`: other jobs own them.

## Allowed files
- `src/renderer/tabs/documentLifecycle.ts`
- `src/shared/messages/en.ts` (one new key only)
- `test/unit/tabsDocumentLifecycle*.test.ts`

## Item 1 — Blocker: an open or a recovery can take a path that a save-as is writing
`DocumentLifecycle.saveNew` reserves `target.canonicalPath` for the whole
awaited write. `openReference` and `recoverDraft` do not read that set.
Their last index check runs after their own `await`, but it cannot see a
save that is still in flight. Sequence: document A saves as `/race.md`
(write pending); the user opens `/race.md`; `openReference` finds no owner,
reads the file and adds a second record; A then calls `adoptPath` and the
index names A only. Two live records (grants `race-a` and `open`) share one
path, and one is absent from the index. Later saves of either tab can
overwrite the other's text.

Fix:
- In `openReference`, after the `readDocument` await and its existing raced
  check, also test `this.inFlightSavePaths.has(read.canonicalPath)`.
  If the path is reserved: do not create a document; release the reference
  grant; show the new status message; return.
- In `recoverDraft`, in the same check, also test the set with
  `read.value.canonicalPath`. If the path is reserved: discard the draft
  grant and return `false`, as for an owned path.
- Keep the check and the record creation in one synchronous block: no
  `await` between them.
- New key `file.openInFlight`. Text: `Could not open "{file}": another tab
  is saving it. Try again.` Use the same curly quotation marks as the
  existing `file.saveInFlight` text.
- Do not change `restoreSession`: it runs at startup before any save.

Tests (tag `AC-R4-02`) in `test/unit/tabsDocumentLifecycleSave.test.ts`:
- Open during save-as, red first: document A saves as `/race.md` with a
  deferred `api.saveDocument`. With the write pending, call
  `openReference({ canonicalPath: "/race.md", grant: "open", name: "race.md" })`
  and let `readDocument` return `/race.md`. Assert: `newDocument` was not
  called; `releaseDocument` got `{ grant: "open" }`; the status is the exact
  new message; `registry.findByPath("/race.md")` is undefined while the
  write is pending; after the deferred resolves, the index maps `/race.md`
  to A and `registry.all()` holds exactly one record for that path.
- Open of another path during the same pending save still creates the
  document and activates it (the guard's other outcome).
- Recovery during save-as: call `lifecycle.recover()` with `listDrafts`
  returning one draft whose `readDocument` names `/race.md`, while A's save
  as `/race.md` is pending. Assert: the draft grant was released, `recover`
  returns `false`, and no record for `/race.md` exists besides A after the
  write resolves.

## Done means
- The open-during-save test is red before the fix and green after. Paste both.
- Mutations, each pasted with the test that goes red:
  - remove the open reservation check: the open test goes red;
  - remove the recovery reservation check: the recovery test goes red;
  - remove the release of the open reference grant: the open test goes red.
- `npm run verify` green. E2E on the Pi is information only; report the
  numbers once and do not widen a budget.
- `git diff origin/bug/slice-5-fix-5..HEAD --stat` names only the allowed
  files.
