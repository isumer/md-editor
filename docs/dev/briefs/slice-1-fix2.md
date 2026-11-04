# Slice 1 — second review round

Same rules as before (no packages, no PLAN.md / package-lock.json / .git;
edit only src/**, test/**). Current: typecheck 0, unit 15/15, e2e 6 pass
/ 2 fail. Friday's probes found:

## 1. External link: a navigation is started and never finishes
Probe: clicking `[Example](https://example.com/)` does call
`shell.openExternal("https://example.com/")` and the window stays put —
but the renderer has begun a navigation that `will-navigate` cancels, and
Playwright's click then waits for it forever (5 s and 30 s timeouts both
hit). A half-started navigation is not a state we want the app in.
Fix (the VS Code approach): no external link may start a navigation.
- Renderer: the preview click handler intercepts every `<a href>`:
  `#…` → in-page scroll (as now); `http:`, `https:`, `mailto:` →
  `preventDefault()` and `window.mdApi.openExternal(url)`; anything else
  (`file:`, `javascript:`, relative paths) → `preventDefault()` and a
  status-bar message (relative `.md` links open in a tab in slice 4).
- New IPC `link:open-external` in main: re-validate the scheme with
  `new URL()` (reject on parse failure or other schemes) before
  `shell.openExternal`. Keep `will-navigate` + `setWindowOpenHandler` as
  the backstop.
- Middle-click / Ctrl-click (`auxclick`) take the same path.
- Test: the existing e2e must pass with a plain `click()` (no
  `noWaitAfter`). Add: a `javascript:alert(1)` link does nothing and
  calls nothing.

## 2. Anchor test fixture uses an id DOMPurify strips on purpose
`<h2 id="target">` loses its id: `target` is a property of
`HTMLFormElement`, and DOMPurify removes such ids (DOM-clobbering guard).
Correct behaviour; the fixture is wrong. Change the fixture id to
`jump-here` (and the link to `#jump-here`). Add a unit/e2e assertion
documenting the guard: `<a id="location">` keeps no `id`.

## Done means
typecheck, test:unit, build exit 0 (paste); list changed files; one- or
two-line comments only.
