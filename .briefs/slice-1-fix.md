# Slice 1 — review fixes

Repo: /home/hisumer/workspace/mdeditor. Same rules as .briefs/slice-1.md:
no package changes, no npm install, do not touch PLAN.md,
package-lock.json or .git. Files you may edit: src/**, test/**,
scripts/**, the config files from slice 1. Nothing else.

Current state: `npm run typecheck` 0, `npm run test:unit` 0 (10 pass,
1 skip), e2e 2 pass / 1 fail (below). Every fix needs a test that FAILS
on the current code and passes after (say in your report which ones you
confirmed red).

## 1. E2E save test uses a path the test runner cannot drive
Probe result: `page.keyboard.press("Control+S")` does not reach Electron's
native menu accelerators (CDP-synthesised keys never do); clicking the
Save menu item from the main process does save correctly. The app is
fine; the test is wrong.
- Give every File menu item a stable `id` (`file-open`, `file-save`,
  `file-save-as`).
- In test/e2e, trigger Save with
  `application.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById("file-save")!.click())`.
- Add an e2e assertion that the items carry the accelerators
  `CmdOrCtrl+O`, `CmdOrCtrl+S`, `CmdOrCtrl+Shift+S`.

## 2. Concurrent saves can leave older text on disk
Two saves of one path in flight (Ctrl+S twice quickly, or save + autosave
later) each write their own tmp file and rename; if the older rename
lands last the file holds the older text while the UI says saved.
- In main, serialise writes per resolved target path (a promise chain
  keyed by path). A write queued behind another runs after it, in order.
- Unit test: two atomicWrite calls to one path where the first one's
  write step is slower (injected fs) → final content is the second.

## 3. atomicWrite edge cases (src/main/atomicWrite.ts)
- **Symlinks:** saving through a symlink must update the link's target,
  not replace the link with a regular file. Resolve with `fs.realpath`
  when the target exists; write the tmp next to the real file.
- **Permissions:** when the target exists, the new file gets the old
  file's mode (`stat().mode & 0o7777`, `chmod` on the tmp before rename).
  Skip on win32.
- **Windows transient locks:** on win32, `rename` failing with `EPERM`,
  `EACCES` or `EBUSY` (antivirus / indexer holding the file) is retried
  up to 5 times with 50/100/200/400/800 ms delays, then fails with the
  last error as cause. Platform and delay are injectable so this is unit
  tested on Linux.
- Keep the existing guarantees (original untouched on failure, no tmp
  left behind).
- Unit tests for each (symlink and mode tests skip on win32).

## 4. A click on a link navigates the whole window away
Clicking `[x](https://example.com)` in the preview replaces the app with
that page — unsaved text is lost. Fix in main:
- `webContents.on("will-navigate")`: always `preventDefault()`; if the
  URL scheme is `http:`, `https:` or `mailto:`, `shell.openExternal(url)`.
- `setWindowOpenHandler`: same scheme rule, always return
  `{ action: "deny" }`.
- In the renderer, a click on an `<a href="#...">` scrolls the preview to
  that id instead (no navigation).
- E2E: fixture with an external link; stub `shell.openExternal` via
  `application.evaluate` to record calls; click the link → recorded URL,
  window URL unchanged, editor text still there.

## 5. Raw HTML can restyle or re-point the app
markdown-it runs with `html: true`; DOMPurify's defaults keep `<style>`,
which would restyle the whole UI from inside a document.
- Sanitiser: `FORBID_TAGS: ["style", "link", "meta", "base", "form"]`,
  `FORBID_ATTR: ["style"]` is NOT wanted (inline style on elements is
  common in Markdown) — keep inline style attributes.
- The skipped DOMPurify unit test: move it to e2e instead (real DOM):
  render a fixture containing `<script>`, `<style>body{display:none}</style>`
  and `<img src=x onerror=...>` → none of those survive in the preview,
  the editor is still visible.

## 6. White flash on startup
Create the window with `show: false` and `backgroundColor` matching the
app background, and show it on `ready-to-show`. E2E: the window becomes
visible (`BrowserWindow.isVisible()`) within 2 s of launch.

## Done means
`npm run typecheck`, `npm run test:unit`, `npm run build` exit 0 — paste
outputs. List every file changed. Do not run e2e (no sockets in your
sandbox); Friday runs it. One- or two-line comments only, where the code
cannot say why.
