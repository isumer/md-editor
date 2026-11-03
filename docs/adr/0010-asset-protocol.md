# 0010 — `app://` for the shell, `doc-asset://` for document images
Status: proposed (2026-11-04, from review finding 8)

**Context.** The CSP allowed `img-src file:`; a hostile document could
point at `file://host/share/x.png` (on Windows this can leak an NTLM
hash) or probe local paths. The app itself ran from `file://`, an opaque
origin for `'self'`.

**Decision.** Register privileged schemes: `app://` serves the bundle;
`doc-asset://<grant>/<relative>` serves images through FileService and the
path policy (inside the document's folder tree, no UNC, no escape).
`file:` is removed from the CSP. Remote images follow the user setting.

**Consequences.** Relative image paths are rewritten by the renderer to
`doc-asset:` URLs; export inlines them.

**Reverse if** Electron offers an equivalent built-in sandboxed file
origin.
