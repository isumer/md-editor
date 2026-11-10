
## Also check these first-pass fixes are on the branch

If missing, apply them (they were lost when the review was sent back):
1. `src/renderer/styles.css`: focus mode removes the sidebar column and
   hides the sidebar; `views.spec.ts` AC-R2-04 asserts the "Workspace"
   complementary hides and returns.
2. `docs/acceptance/R03-sync-scroll.md`: AC-R3-05 stays `planned` until
   it has passing evidence (it did not finish within 300 s on the Pi).
3. `test/unit/syncScrollController.test.ts`: the document-switch test
   starts with an old preview target and proves later pages cannot reapply
   it; the file has a lint explanation for its size (468 lines).
