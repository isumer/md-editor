# Slice 3d-1 — `app://` origin and page policy (ADR-0010, first half)

**Builds on the slice under review, `auto/007-3c-3-*`** (render-worker
mirror). It touches different files; work on top of it.

Read AGENTS.md, docs/architecture.md §3, §8, ADR-0010, then
src/main/app/window.ts, src/main/main.ts, src/main/ipc/handle.ts (trusted
window registry), src/renderer/index.html, electron.vite config, and the
e2e helpers. No new dependencies. You cannot run Electron: write e2e
tests, make typecheck pass, name the e2e tests you could not run.
`doc-asset://` is NOT in this slice (3d-2).

## Goal
The renderer loads from `app://bundle/index.html` served by a privileged
scheme instead of `file://`, and the CSP drops `file:`.

## Main (`src/main/app/**`, a new `src/main/app/appProtocol.ts`)
- Before `app.whenReady`, `protocol.registerSchemesAsPrivileged` for `app`
  (`standard`, `secure`, `supportFetchAPI`, `allowServiceWorkers: false`).
  After ready, `protocol.handle("app", …)`: host must be exactly `bundle`;
  resolve the URL path against the renderer bundle directory; decode once,
  reject (404, empty body) anything that after `path.resolve` is not
  inside the bundle dir (also backslashes, NUL, encoded `%2e%2e`,
  absolute paths, other hosts, directory requests); serve with
  `net.fetch(pathToFileURL(file))`. Content type by extension through
  net.fetch. Pure resolve function in its own file, unit-tested.
- `window.ts`: `loadURL("app://bundle/index.html")`; the trusted-window
  registration uses that URL instead of the `file:` URL (grants and
  senderFrame checks must still work: the existing e2e suites prove it).
- Navigation/will-navigate backstop keeps refusing everything except the
  app URL.

## Renderer
- `index.html` CSP: `default-src 'self'; img-src 'self' data: https:;
  style-src 'self' 'unsafe-inline'; worker-src 'self'; script-src 'self'`
  (no `file:`). Workers and module scripts must still load under `app://`;
  fix paths (vite `base`) only if the build needs it, minimal change.

## Tests (each red against pre-change code)
- [AC-SEC-14] unit: resolve function table (inside, nested, `..`,
  `%2e%2e`, `%2f..`, backslash, NUL, absolute, other host, directory,
  empty) → exact outcome. e2e: `location.origin === "app://bundle"`;
  `fetch("app://bundle/../package.json")` and `fetch("app://other/index.html")`
  resolve to non-ok and no content; `fetch("app://bundle/index.html")` ok.
- [AC-SEC-15] e2e: listen for `securitypolicyviolation`; injected inline
  script and `eval("1")` each fire it and have no effect; `<img
  src="file:///etc/hostname">` fires a violation and does not load; live
  `webContents.getLastWebPreferences()` (via electron app evaluate) shows
  sandbox, contextIsolation, webSecurity true and nodeIntegration false.
- All existing unit and e2e tests pass (update paths only).

## Allowed files
src/main/**, src/renderer/index.html, electron.vite.config.* (only if
needed for base paths), test/unit/**, test/e2e/**. Nothing else — no
acceptance docs, PLAN, architecture, coverage config, workflows.

## Done means
typecheck, check:deps, test:unit, check:coverage, build exit 0 — paste;
list files; red evidence per new test; name the e2e tests you could not
run.
