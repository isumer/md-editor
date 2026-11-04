# Slice 2a — review fixes

Same rules as slice-2a.md. Friday installed `jsdom@30.1.3` and
`@types/jsdom@30.0.0` (dev). No other package changes. Do not edit
PLAN.md, docs/acceptance/**, LICENSE.md, package-lock.json, .git, src/**.

Friday's review of the 2a result (`npm run verify` exits 1):

## 1. Playwright deletes the unit JUnit report
Playwright wipes its `outputDir` (`test-results/`) at start, so
`test-results/unit-junit.xml` is gone when `check:acceptance` runs and
every unit-proven criterion shows "missing". Write both JUnit reports to
`reports/` (`reports/unit-junit.xml`, `reports/e2e-junit.xml`), keep
Playwright artifacts in `test-results/`, update check-acceptance,
summarize-junit, ci.yml artifact paths and .gitignore. Done when a
clean `npm run verify` exits 0 locally (Friday runs it).

## 2. Coverage parses index.html
`include: ["src/**"]` makes V8 coverage try to parse
`src/renderer/index.html` (RolldownError in the output). Use
`include: ["src/**/*.ts"]`.

## 3. Test integrity — tests that prove wiring against fakes
PLAN "Test integrity" (read it; it was added after your brief):
doubles only at boundaries (fs, clock, randomness, IPC transport,
electron APIs, dialogs, shell). Review verdicts:
- `test/unit/app.test.ts` — **delete**. It replaces CodeMirror and two of
  our own modules (`renderScheduler`, `sanitize`) with fakes, so it
  proves app.ts calls fakes. app.ts is UI wiring and is covered by e2e;
  e2e coverage merging arrives in slice 3. Exclude
  `src/renderer/app.ts` from unit coverage with a comment saying exactly
  that.
- `test/unit/sanitize.test.ts` — **rewrite** with the real DOMPurify on a
  jsdom window (`// @vitest-environment jsdom` or create the window and
  pass it to `DOMPurify(window)` — choose the way that tests our actual
  `sanitizeRenderedHtml`, which may mean exporting a factory that takes
  a window; keep the production behaviour identical). Test with real
  inputs: script/style/link/meta/base/form removed, `on*` handlers
  removed, `javascript:` hrefs removed, `data-line` kept, inline `style`
  kept, `id="location"` dropped (tag AC-SEC-04 / AC-SEC-05).
- `test/unit/main.test.ts` — mocking `electron` and `node:fs` is fine
  (boundaries); mocking `../../src/main/atomicWrite` is not. Use the real
  atomicWrite against the faked fs (atomicWrite already accepts an fs
  port — wire main's save path so the test can supply it, without
  changing runtime behaviour), or leave the save assertions to e2e and
  drop them here. Say which you chose.
- `test/unit/renderWorker.test.ts` — acceptable (the worker shell is a
  transport seam), but prefer a real input over mocking `render`: keep
  the mock only for the error path, with a one-line comment why.
- Re-run coverage; if a threshold now fails, report the numbers —
  **do not lower thresholds or the baseline**. Friday decides.

## 4. Licence and README
The project is now **GPL-3.0-or-later** (LICENSE.md exists).
- package.json `"license": "GPL-3.0-or-later"`.
- README License section: GPL-3.0-or-later, link LICENSE.md, one line on
  what it means (free to use/modify/share; derivatives under the same
  licence).
- README download table: keep Windows installer + portable zip, macOS
  DMG, Linux deb + AppImage (no macOS zip). Fine as is if already so.

## 5. AGENTS.md
Add the "Test integrity" and "Code quality gates" rules from PLAN.md
(they post-date your brief) in the same short imperative style; note
which gates are not wired yet (they land in slice 3).

## Done means
typecheck, test:unit (with coverage numbers), build exit 0 — paste;
list changed files; state which tests you confirmed red against a broken
sanitizer.
