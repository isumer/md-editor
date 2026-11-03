# 0003 — SolidJS for UI chrome
Status: proposed (2026-11-04)

**Context.** Beyond editor and preview, the app has tab bars, a sidebar
tree, panels, dialogs, settings, a command palette, compare/merge
toolbars. Hand-written DOM code for all of that becomes inconsistent and
leaks listeners. The response-time budget forbids per-keystroke
re-renders of the chrome.

**Options.** Plain DOM + small helpers · React/Preact (virtual DOM) ·
Svelte 5 (compiler) · Lit (web components) · SolidJS (fine-grained
signals, no virtual DOM).

**Decision.** SolidJS (MIT, ~7 KB). Signals update only the nodes that
read a changed value — typing in the editor touches no chrome; components
are plain functions; JSX via the Vite plugin. CodeMirror and the preview
patcher own their own DOM; Solid only hosts them.

**Consequences.** One new runtime dependency plus its Vite plugin
(dev). Contributors need Solid's rule "components run once".

**Reverse if** a measured chrome interaction misses its budget because of
the framework, or the dependency becomes unmaintained.
