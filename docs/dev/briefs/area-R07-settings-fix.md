review: deep

# Area R07 fix: settings IPC, startup order and acceptance

Base: continues the PR branch `feature/area-R07-karen` at `8fae546`
(job 1272). Run `git merge origin/main` first. Add no features beyond the
items below. No new dependencies. Show a red test or a red mutation for
every behaviour change (AGENTS.md). One commit per item.

## Why this went back (read first)

Lane 2 review (job 1276) found the branch red on this host and not
delivering its brief:

- `npm run verify` e2e (`--grep-invert @AC-PERF`) exits 1: nearly every
  spec times out at ~10 s because the app never finishes starting. In
  `test/e2e/editor.spec.ts:16` the window title stays `Untitled`, so
  `initialize()` never reaches `updateTitle()`.
- No acceptance criterion was flipped, no `AC-R7-*`-tagged test exists,
  and `CHANGELOG.md` is unchanged. `docs/acceptance/R07-background-colour.md`
  still reads `planned` for all four rows.

The startup stall is not a timing flake. It has a named static cause in
item 1. Typecheck and build are green on the merged tree.

## Items

1. **Blocker — settings IPC returns a double-wrapped `Result`.**
   `src/main/ipc/handle.ts:65` returns `{ ok: true, value: await action(...) }`
   for every handler. The new `src/main/ipc/settings.ts:14-22` actions
   themselves return `{ ok: true, value: settings }` (and the write path
   `{ ok: true, value: {} }`), so the renderer receives
   `{ ok: true, value: { ok: true, value: settings } }` instead of
   `Result<Settings>`. `src/renderer/main.ts:431-437` then reads
   `settingsResult.value.editor.background`, which is `undefined` on the
   wrapper, and throws a `TypeError` before `createUntitled()` at
   `:457`. `void initialize()` at `:479` has no catch, so the rejection
   is unhandled, no document opens, the title stays `Untitled`, and every
   e2e row that opens a document fails.
   Required: every handler action returns the raw value, exactly like
   `src/main/ipc/file.ts:6-13` and `src/main/ipc/session.ts:12-32`. The
   write action resolves a raw `void`/`{}` payload as those handlers do.
   Do not "fix" this by unwrapping in the renderer.
   Proof: a unit test must register the real handler (through `handle`,
   with a window registered via `registerTrustedWindow`) and invoke the
   registered `ipcMain.handle` callback with a trusted sender event;
   assert the returned `Result` has `ok === true` and
   `value.editor.background` / `value.preview.background` directly. It
   must be red before the change — show that.
   Also prove it end to end: `test/e2e/editor.spec.ts:16` (argv document
   opens) green again.

2. **Blocker — a settings read must never gate startup.**
   `src/renderer/main.ts:431-455` awaits `loadSettings()` before creating
   the first document and before `readyForOpenRequests()`. `PLAN.md:107-109`
   says the settings UI loads after the first paint; startup work must
   not hang the app on a background read. Even after item 1 the ordering
   leaves the whole window hostage to the io-worker.
   Required: create and activate the untitled document, update the
   title, and ask for open requests first; apply backgrounds when the
   settings read settles (or from a cached default), and never let a
   failed/rejected/slow settings read stop the document path. Attach a
   `.catch` to `initialize()` that shows the status line, as the rest of
   the file does, so an exception cannot become an unhandled rejection.
   Proof: show that a settings read which fails (store `read` throws, or
   the IPC returns `ok: false`) still opens the argv document and leaves
   the app usable. A unit test around the sequencing is fine; name how
   you made the read fail.

3. **Blocker — acceptance honesty: prove and flip the criteria the
   branch can actually satisfy.**
   The branch ships the apply/contrast module and persistence but flips
   nothing. AC-R7-03 and AC-R7-04 are provable now:
   - AC-R7-03: launch the app with a `settings.json` in the profile whose
     `editor.background`/`preview.background` are not valid colours
     (e.g. `"not-a-colour"`, `"#12345"`); assert the pane uses the theme
     background and the app does not crash.
   - AC-R7-04: launch with a stored background whose contrast with the
     theme text is below 4.5:1 (e.g. `#000080`); assert the computed
     editor and preview text colour is the light/dark colour and that
     its contrast ratio against the pane background is at least 4.5:1.
   Tag the tests `@AC-R7-03` / `@AC-R7-04` in Playwright, or name Vitest
   tests `AC-R7-03:` / `AC-R7-04:` (see `docs/acceptance/README.md`),
   and re-run `npm run check:acceptance` with those rows passing.
   AC-R7-01 (settings dialog) and AC-R7-02 (theme switch plus reset)
   need a settings dialog and a theme control that do not exist yet;
   R08 (`docs/acceptance/R08-themes-and-settings.md`, AC-R08-03/-04)
   owns them. Do not build a settings dialog in this area. Leave
   AC-R7-01/-02 `planned` and say so in your report.
   Flip only rows whose tagged test passes on your candidate. Acceptance
   file edits are a protected change: the merge commit needs a
   `Protected-change:` trailer naming the file.
   Also add the user-visible change to `CHANGELOG.md` under
   `[Unreleased]` -> `Added` (custom editor/preview background colours
   survive a restart, invalid stored colours fall back to the theme,
   text stays readable).

4. **Major — settings channels must use a shared typed contract
   (ADR-0007).** `src/preload/preload.ts:446-447` hard-codes
   `"settings:read"` / `"settings:write"`, and the main handler does the
   same. Every other channel imports constants and request/reply types
   from `src/shared/ipc/*`. Add `src/shared/ipc/settings.ts` with the
   channel constants and validators, use them in `src/main/ipc/settings.ts`,
   `src/preload/preload.ts` and the renderer typings, and validate the
   write payload's shape (arrays/nulls rejected; unknown keys keep their
   documented round-trip behaviour). Do not make the validator stricter
   than `normalizeSettings` already is for unknown keys.

5. **Major — the theme is a lie.** `src/renderer/main.ts:432` hard-codes
   `currentTheme = "light"`; the MutationObserver at `:454-455` watches
   `data-theme`, which nothing in `src/` ever sets, and
   `src/renderer/styles.css:11-31` only reads it. On a dark-mode desktop
   the theme defaults applied here are the light ones, so a stored
   invalid colour falls back to `#ffffff` and the contrast choice is made
   against the wrong background. Resolve the initial theme from the
   actual UI state (`prefers-color-scheme` until R08 stores a theme),
   listen for that media query's changes, and keep the observer only if
   a real setter follows it. Test both theme resolutions (jsdom media
   mocking is fine), including the AC-R7-03 fallback in dark mode.

6. **Major — reuse the existing atomic write.** `src/io-worker/services/settings.ts:26-39`
   reimplements an atomic write with a fixed `${filePath}.tmp` path;
   `src/node-shared/atomicWrite.ts` already exists and is used by
   `src/io-worker/services/session.ts`. Use `atomicWrite` (temp file
   per write, fsync, rename) so two windows cannot collide on one temp
   path. Keep the settings-write failure surfaced as a `Result`, not a
   throw across the port.

7. **Minor — dead code.** Remove the unused `saveSettings`,
   `onMenuCommand` and `Settings` imports in `src/renderer/main.ts:42-43`
   (or use them in item 3's write path). `src/renderer/features/background/background.ts:40-49`
   sets `--custom-background`/`--custom-text-color` on the editor and
   preview elements, but no CSS rule reads either variable; remove the
   element writes or add the rules that consume them. The element-level
   write must have a test that fails if the production selector is
   broken.

8. **Minor — tests that could not catch the blocker.** `test/unit/mainSettingsIpc.test.ts`
   only asserts that `ipcMain.handle` was called; it never invokes a
   handler, which is why the double wrap passed review. Replace the
   registration-only assertions with the item 1 invocation test.
   `test/unit/background.test.ts` builds `#editor` and `#preview` as
   siblings, but production looks up `#editor .cm-editor`, so the
   element-level application is never exercised; make the mock nested.
   `test/unit/ioWorkerSettings.test.ts` uses a fixed
   `/tmp/test-settings-store`; use `fs.mkdtemp` so parallel runs cannot
   collide.

## Known reds that are not yours

- `test/unit/editor.test.ts` AC-PERF-10 times out twice on this Pi; it
  reproduces on current `origin/main` and is owned by the perf lane
  (jobs 1218/1229). Name it in the report; do not fix it here.
- AC-PERF-09/10/11 budgets are information only on this host
  (`docs/acceptance/PERF-response-time.md`). Do not tune a budget.
- The merge conflicts with `feature/shared-registry-split` and
  `feature/slice9-views-sync-scroll` are those areas' business, not this
  fix.

## Allowed files

- `src/renderer/features/background/**`
- `src/renderer/main.ts`, `src/renderer/styles.css`
- `src/main/ipc/settings.ts`, `src/main/app/settings.ts`, `src/main/main.ts`,
  `src/main/io/ioWorker.ts`
- `src/io-worker/control.ts`, `src/io-worker/services/settings.ts`
- `src/preload/preload.ts`, `src/renderer/platform/**`
- `src/shared/ipc/settings.ts` (new), `src/shared/ipc/ioControl.ts`,
  `src/shared/settings/**`
- `test/unit/background.test.ts`, `test/unit/ioWorkerSettings.test.ts`,
  `test/unit/mainSettingsIpc.test.ts`, `test/unit/mainSettingsStore.test.ts`,
  `test/unit/preload.test.ts`, `test/unit/settings.test.ts`,
  `test/unit/main.test.ts`, `test/fixtures/settings/**`
- `test/e2e/settings.spec.ts` (new) and the e2e helper/fixture files it
  needs
- `docs/acceptance/R07-background-colour.md`, `CHANGELOG.md`,
  `docs/reviews/**`

Do not edit `scripts/check-acceptance.mjs`, any budget, or another
area's feature directory. If you must touch a file outside this list,
stop and say why in the report.

## Done means

- `npm run verify` on this host: typecheck, unit, and the functional e2e
  rows green (the known AC-PERF-10 unit timeout above is the only
  allowed red, and it must be named). `check:acceptance` reports
  AC-R7-03 and AC-R7-04 passing; AC-R7-01/-02 remain `planned` with the
  R08 dependency recorded in the report.
- Item 1's handler test shown red then green; item 3's two criteria were
  red before the fix (no previous behaviour) and are green after.
- Mutation evidence recorded for at least the settings IPC round trip
  and the invalid-colour fallback (break the production line, show the
  tagged test red, restore it).
- The report lists the exact commands run, the Pi perf numbers it saw,
  and every file changed outside the allowed list.
