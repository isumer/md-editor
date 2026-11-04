# 0010 — `app://` for the shell, `doc-asset://` for document images
Status: accepted (2026-11-04, after two review rounds)

**Context.** `img-src file:` let a document point at `file://host/share`
(an NTLM leak on Windows) or probe local paths; the app ran from an
opaque `file://` origin.

**Decision.**
- Privileged scheme `app://` serves the bundle; CSP `'self'` is the
  bundle only. `file:` is removed from the CSP.
- Document images use `doc-asset://<windowId>.<grant>/<relative path>`.
  `protocol.handle` runs in main: it checks the window id and grant
  against its table, asks the io-worker to resolve the path (realpath
  confinement inside the document's folder tree, no UNC, no `..`
  escape), then streams the resolved file with `net.fetch` — **no
  decoding or buffering in main**. This is the one documented exception
  to "no document content through main": raw bytes passed through as a
  stream.
- Remote images follow the always / ask / never setting.

**Consequences.** Relative image paths are rewritten to `doc-asset:` by
the renderer; export inlines them. A per-window session partition can be
added if strict cross-window isolation is ever required.

**Reverse if** Electron offers an equivalent sandboxed file origin with
per-window scoping.
