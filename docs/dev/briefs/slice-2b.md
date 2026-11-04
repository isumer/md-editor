# Slice 2b — packaging, releases, shell integration, portable mode

Repo: /home/hisumer/workspace/mdeditor. Read AGENTS.md (binding), then
PLAN.md sections "Releases", "Shell integration", "Stability and
regression testing" (Upgrade / Install rows only), and
docs/architecture.md §2 (startup) and §12. No package changes (Claude
added `@electron/fuses@1.8.0`). Do not edit PLAN.md, docs/architecture.md,
docs/adr/**, package-lock.json, .git. The product name is the existing
`productName` "MD Editor" and must come from package.json everywhere
(installer, registry keys, artifact names, window title) — one place to
rename later. Keep Electron's default icon (no icon files yet).

## Allowed files
package.json (the "scripts" block only — no dependency or other field
changes), src/main/** (only what portable mode, single instance and
open-file need), src/shared/**, src/preload/** (only if a new IPC is needed),
src/renderer/** (only the open-request handling), build/**,
electron-builder.yml, scripts/**, test/**, .github/workflows/release.yml,
.github/workflows/ci.yml (only to add the jobs below), docs/release.md,
docs/acceptance/** — NO: Claude writes criteria; tag tests with the ids
listed at the end.

## 1. electron-builder.yml
- appId `io.github.isumer.mdeditor`; productName from package.json;
  `asar: true`; files: dist/**, package.json; no source maps in the
  package.
- **Fuses** (`electronFuses`): RunAsNode off, EnableNodeOptionsEnvironment-
  Variable off, EnableNodeCliInspectArguments off,
  OnlyLoadAppFromAsar on, EnableEmbeddedAsarIntegrityValidation on,
  EnableCookieEncryption on.
- Windows: `nsis` (oneClick false, perMachine false, allowElevation false,
  allowToChangeInstallationDirectory true, include build/installer.nsh,
  license LICENSE.md) and `zip` (the portable build) for x64 and arm64.
  Do **not** use the `portable` target (self-extracts per launch).
- macOS: `dmg` only, x64 and arm64 separately; `hardenedRuntime` true;
  no signing config (unsigned for now).
- Linux: `deb` and `AppImage`, x64 and arm64; `.desktop` with MimeType
  list for text/markdown, text/plain, text/x-log, application/json …;
  category Utility;TextEditor;Development.
- `extraResources`: THIRD_PARTY_NOTICES.txt and LICENSE.md.
- artifactName patterns as in PLAN "Releases" with `${productName}`
  (spaces → `-`), `${version}`, `${arch}`.
- npm scripts: `dist` (current platform), `dist:linux`, `dist:win`,
  `dist:mac`, all `--publish never`.

## 2. Portable mode (src/main)
- A pure, unit-tested function `resolveDataDirectory({ exeDir,
  markerExists, isWritable, defaultUserData })` → `{ path, portable,
  notice? }`: marker `portable` next to the executable (for AppImage: next
  to the `.AppImage`, via `process.env.APPIMAGE`) → `<dir>/data`; if not
  writable → default profile + a notice for the status bar. Called before
  `app.whenReady`, then `app.setPath("userData", …)`.
- The Windows portable zip contains the `portable` marker file; add it in
  a post-package step (`scripts/add-portable-marker.mjs`, cross-platform,
  using node's zlib-free approach: build the zip from the unpacked
  `win-unpacked` dir after copying the marker in, via electron-builder's
  `zip` target on a prepared dir, or document the exact command — pick
  one, explain in docs/release.md).

## 3. Single instance and open requests (src/main)
- `app.requestSingleInstanceLock()`; a second launch forwards its file
  arguments (`second-instance` argv, relative to the second instance's
  cwd) and focuses the window. macOS `open-file` events (before and after
  ready) are handled the same way. All of them go through one
  `openRequests` queue that is drained when the renderer is ready.
- Renderer: an open request for a file while the current document is
  dirty asks "Discard unsaved changes?" (window.confirm is fine until
  tabs land in slice 5); clean → open.
- No path is opened that did not come from argv / open-file /
  second-instance / dialog (these are the future grant sources).

## 4. Shell integration (Windows, NSIS)
- `build/shell-integration.json`: the single table of per-user registry
  entries (HKCU\Software\Classes\*\shell\<Key>Edit with label "Edit with
  <productName>", icon, command `"<exe>" "%1"`; Directory\shell and
  Directory\Background\shell "Open folder in <productName>" with `"%1"` /
  `"%V"`). `scripts/gen-installer-nsh.mjs` generates `build/installer.nsh`
  (customInstall writes, customUnInstall deletes) from it; a unit test
  compares the output to a committed golden file.
- Open-with registration / default for .md: leave out for now (installer
  page comes later); note it in docs/release.md.
- Portable builds never write the registry.

## 5. Licences
- `scripts/third-party-notices.mjs`: walk the **production** dependency
  tree from package-lock.json, collect each package's licence id and
  licence text, write THIRD_PARTY_NOTICES.txt (generated at build time,
  gitignored), and **fail** on any licence not in the GPL-3-compatible
  allowlist (MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, MPL-2.0,
  0BSD, CC0-1.0, Unlicense, LGPL-2.1+, LGPL-3.0, GPL-3.0, Python-2.0,
  BlueOak-1.0.0, and SPDX `OR` expressions where any branch is allowed).
  Unit-test the parser/allowlist on fixtures.
- npm script `check:licenses` runs it in check mode; ci.yml runs it.

## 6. Workflows
- **ci.yml**: add `check:licenses`. Add a job `package-linux` (ubuntu,
  needs test) that runs `npm run dist:linux -- --x64` and then a smoke
  test: extract the AppImage (`--appimage-extract`), launch it under xvfb
  with a fixture file, assert it stays up 5 s and logs no fatal (a small
  node script); and a fuse check script `scripts/check-fuses.mjs <binary>`
  that reads the fuses with `@electron/fuses` and fails on any mismatch.
- **release.yml** (on tags `v*`, and workflow_dispatch with a dry-run
  input): matrix ubuntu / windows / macos; each runs the full verify
  first, then `dist:<os>` for x64 + arm64, runs check-fuses on its
  output, uploads artifacts. Windows additionally: silent install of the
  x64 NSIS installer (`/S`), `reg query` the context-menu keys, launch
  with a fixture and quit, silent uninstall, assert the keys are gone; unzip
  the portable zip, launch it, change nothing, assert a `data` folder was
  created next to the exe and nothing under `%APPDATA%\MD Editor`.
  A final job (needs all) downloads artifacts, writes SHA256SUMS.txt,
  extracts the version's section from CHANGELOG.md as notes, and creates
  a **draft** GitHub release with `gh release create --draft` (tags
  containing `-` are marked `--prerelease`). `permissions: contents:
  write` only on that job. Actions pinned by SHA as in ci.yml (add
  actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 #
  v8.0.2).
- `docs/release.md`: how to cut a release (CHANGELOG section, tag
  `vX.Y.Z-beta.N`, push tag, check draft, publish), what each asset is.

## Tests you must write (tag ids in brackets — Claude adds the criteria)
- unit `resolveDataDirectory`: marker+writable → portable data dir;
  marker+not writable → default + notice; no marker → default; AppImage
  env path [AC-R9-01, AC-R9-02]
- unit `openRequests` queue: requests before ready are delivered in
  order after ready; relative paths resolved against the sender's cwd;
  non-file arguments and flags ignored [AC-R9-03]
- unit installer.nsh golden [AC-R9-04]
- unit third-party-notices allowlist + OR-expressions + a GPL-incompatible
  fixture (e.g. SSPL) fails [AC-R9-05]
- unit check-fuses on a fixture fuse wire / mocked reader boundary
  [AC-SEC-06]
- e2e: launching a second instance with a file opens it in the first
  window (no second window) [AC-R9-03]; an open request on a dirty
  document asks before discarding [AC-R5-09]
Every new test must fail against the code before your change — state
how you checked.

## Done means
typecheck, test:unit (coverage), build, `npm run dist:linux -- --arm64
--dir` (unpacked, to prove the config builds here) exit 0 — paste
outputs; list files. e2e: you cannot run it; Claude does.
