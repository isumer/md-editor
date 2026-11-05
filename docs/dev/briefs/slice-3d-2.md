# Slice 3d-2 — `doc-asset://` for document images (ADR-0010, second half)

**Builds on the slice under review, `auto/009-3d-1-*`** (`app://` origin
and page policy). It touches different files; work on top of it. Relative
images currently work via `file:` in the CSP; 3d-1 removes `file:`, so
this slice restores them through `doc-asset://` before they regress.

Read AGENTS.md, docs/architecture.md §3, §8, §9, ADR-0010, ADR-0008,
ADR-0011, then `src/main/grants/grantTable.ts`,
`src/main/io/ioWorker.ts`, `src/io-worker/control.ts`,
`src/io-worker/services/file.ts`, `src/io-worker/grants.ts`,
`src/renderer/features/preview/{preview,sanitize}.ts`,
`src/renderer/main.ts`, `src/shared/ipc/ioControl.ts`, and the e2e
helpers. No new dependencies. You cannot run Electron: write e2e tests,
make typecheck pass, name the e2e tests you could not run. `doc-asset://`
is this slice; remote-image policy (always/ask/never) is NOT (later).

## Goal
A relative image in a Markdown document loads from inside that document's
folder through `doc-asset://`, served by main after the io-worker resolves
the path under realpath confinement. Nothing outside the folder is
readable, and no document bytes pass through main other than the stream.

## URL form
`doc-asset://<windowId>/<grant>/<relative-path>` — window id (an integer)
as the host, the grant handle and the relative path as path segments.
Rationale: the grant handle is case-sensitive base64url; URL hosts under a
standard scheme are lowercased, so the grant must live in the path.
Register `doc-asset` privileged with `secure` and `supportFetchAPI` (not
`standard`), so dot segments survive for explicit rejection.

## Main (`src/main/app/docAssetProtocol.ts`, wired in `src/main/main.ts`)
- After ready, `protocol.handle("doc-asset", …)`: parse host as a safe
  integer window id; first path segment is the grant, the rest is the
  relative path (decode once). Unknown/revoked window id or grant →
  404 empty body. Any `..`, backslash, NUL, encoded `%2e%2e`/`%2f..`,
  absolute or empty path segment → 404 empty body.
- Ask the io-worker to resolve (grant canonical path + relative path
  against the path policy) over the control channel; on error or escape →
  404. Then stream the resolved file with
  `net.fetch(pathToFileURL(resolved))` — no read/decode/buffer in main.
- The renderer learns its window id once: extend `OpenRequestReady`
  (`src/shared/ipc/file.ts`) with `windowId`, filled in
  `src/main/app/startup.ts` and stored by `src/renderer/main.ts`.

## io-worker + node-shared
- `src/node-shared/pathPolicy.ts`: pure path policy (ADR-0008 §9) —
  reject device names, ADS (`:`), unexpected UNC, NUL and empty; confine a
  candidate to a root by resolving and realpath-ing both and requiring the
  result to stay inside the root. Unit-test it in isolation.
- `src/io-worker/services/file.ts`: `resolveAsset(windowId, grant,
  relativePath)` → the confined canonical path or a typed error, using the
  grant table's root (the document's folder = `dirname` of its canonical
  path) and the path policy.
- New control request `resolveAsset` in `src/shared/ipc/ioControl.ts`
  (exact-shape validators, window id, grant handle and relative-path
  length limits) handled in `src/io-worker/control.ts` with a matching
  reply; main awaits it via `src/main/io/ioWorker.ts`.

## Renderer
- `src/renderer/features/preview/rewriteAssets.ts`: pure function that
  rewrites `src`/`srcset` on images whose URL is relative (leave
  `http(s):`, `data:`, absolute URLs alone) to
  `doc-asset://<windowId>/<grant>/<relative-path>`, applied to the
  sanitised HTML string before it reaches the DOM (no failed `app://`
  load). `sanitize.ts` must allow the `doc-asset:` scheme for image
  sources and nothing else.
- `src/renderer/main.ts` applies the rewrite in `applyRenderResult`'s
  pipeline, using the stored window id and `documentState.currentGrant`;
  a document with no grant renders images as plain broken/omitted, never a
  `file:` request.

## Tests (each red against pre-change code)
- [AC-SEC-16] unit: path-policy table (inside, nested, `..`, `%2e%2e`,
  `%2f..`, backslash, NUL, absolute, UNC, device name, ADS, empty,
  symlink escaping the folder) → exact outcome. unit: rewrite table
  (relative, `./`, `../`, `data:`, `https:`, `srcset` with mixed URLs) →
  exact output. e2e: a document with a relative image shows it; an image
  with `../../outside.png` shows nothing and reads no file outside the
  folder.
- [AC-SEC-17] unit: the control contract accepts exactly the valid
  `resolveAsset` shapes and rejects hostile ones; a grant for another
  window id is refused. e2e: `fetch("doc-asset://<bad-window>/<grant>/x")`,
  a revoked grant, and a valid request for an in-folder file → non-ok /
  ok with the right content type.
- All existing unit and e2e tests pass (update paths only).

## Allowed files
src/main/**, src/io-worker/**, src/node-shared/**, src/shared/ipc/**,
src/renderer/**, test/unit/**, test/e2e/**. Nothing else — no acceptance
docs, PLAN, architecture, ADRs, coverage config, workflows.

## Done means
typecheck, check:deps, test:unit, check:coverage, build exit 0 — paste;
list files; red evidence per new test; name the e2e tests you could not
run.