# 0001 — Electron as the shell
Status: accepted (2026-11-04)

**Context.** Windows, macOS and Linux; the Markdown preview and its PDF
export must look identical everywhere; the team writes TypeScript.

**Options.** Electron (bundled Chromium) · Tauri (system webview: WebView2,
WKWebView, WebKitGTK) · Qt/C++ · native per platform.

**Decision.** Electron. One engine on every OS, so preview, print and
`printToPDF` behave the same; mature APIs for menus, dialogs, single
instance, utility processes, fuses.

**Consequences.** ~100 MB installers and ~150 MB RAM baseline; startup
must be engineered (budgets in PLAN). Security posture must be configured
(sandbox, context isolation, fuses) — see PLAN "Security testing".

**Reverse if** Tauri's engines converge enough for PDF/print parity and
the size matters more to users than parity.
