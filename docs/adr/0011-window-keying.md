# 0011 — Everything keyed by window; one Document per path app-wide
Status: accepted (2026-11-04, after two review rounds)

**Context.** v1 has one window, but globals (`mainWindow`) and
renderer-singleton assumptions make a second window a rewrite later.

**Decision.** Grants, io-worker ports, menu contributions, sessions and
service state are keyed by window id from the start. The one-Document-
per-path rule is app-wide; opening a path already open in another window
focuses it there.

**Consequences.** Slightly more bookkeeping now; multi-window becomes
additive.

**Reverse if** the product decides never to support multiple windows.
