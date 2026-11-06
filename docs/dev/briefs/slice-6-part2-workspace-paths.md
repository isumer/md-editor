# Slice 6 module part 2 — workspace path safety

Base: main

A pure module that checks a path before a workspace file action runs.
Slice 6 wiring (file actions, watcher, panel) comes later in the dev lane.
This item adds no wiring, no IPC, no filesystem access and no UI.
AC-R11-07 is in `docs/acceptance/R11-workspace-sidebar.md`
(`status: planned`; do not edit it). No new dependencies.

Symlinks that leave the root need the filesystem: the slice 6 wiring part
must resolve real paths for that. This module covers the lexical rules only.

## The module
New file `src/shared/workspace/workspacePath.ts`. No imports. Export exactly:

```
export type WorkspacePathReason =
  | "empty" | "absolute" | "parent" | "dot" | "separator"
  | "device-name" | "alternate-stream" | "trailing-dot" | "control";

export type WorkspacePathCheck =
  | { readonly ok: true; readonly segments: readonly string[] }
  | { readonly ok: false; readonly reason: WorkspacePathReason };

export function checkWorkspacePath(input: string): WorkspacePathCheck;
```

Rules, checked in this order; the first failure decides the reason:
1. `input` is empty, or contains only whitespace, gives `"empty"`.
2. A leading `/` or `\`, a leading drive letter followed by `:` (any case),
   or a UNC prefix (`\\server` or `//server`) gives `"absolute"`.
3. Split on `/` and `\`. An empty segment (a doubled or trailing separator)
   gives `"separator"`. A segment `.` gives `"dot"`. A segment `..` gives
   `"parent"`.
4. A segment that contains `:` gives `"alternate-stream"`.
5. A segment that equals a Windows device name, case-insensitively, with or
   without an extension, gives `"device-name"`: `CON`, `PRN`, `AUX`, `NUL`,
   `COM1` to `COM9`, `LPT1` to `LPT9`.
6. A segment that ends with `.` or a space gives `"trailing-dot"`.
7. A code point below U+0020 or equal to U+007F gives `"control"`.
8. Otherwise return the segments in input order. Do not trim, normalise,
   URL-decode or change case.

The function must not read the filesystem, must not mutate its input, and
must not resolve `..`; it refuses it.

## Tests (`test/unit/workspacePath.test.ts`)
Every test title starts with its criterion id. Add no fixtures.
- `AC-R11-07: refuses a parent segment` — `../outside.md` and
  `a/../../b.md`; reason `"parent"`.
- `AC-R11-07: refuses an absolute path` — `/etc/passwd`, `\\server\share\x.md`,
  `C:\x.md`, `c:/x.md`; reason `"absolute"`.
- `AC-R11-07: refuses a Windows device name` — `CON`, `aux.md`, `COM1`,
  `Lpt9.txt`; reason `"device-name"`. `CONSOLE.md` is accepted.
- `AC-R11-07: refuses an alternate data stream` — `notes.md:secret` and
  `a:b.md`; reason `"alternate-stream"`.
- `AC-R11-07: refuses empty, dot, separator and trailing forms` — `""`,
  `"  "` (`"empty"`), `.`, `a/./b` (`"dot"`), `a//b`, `a/` (`"separator"`),
  `notes.md.`, `notes.md ` (`"trailing-dot"`), `a\u0000b` (`"control"`).
- `AC-R11-07: returns the segments of a relative path` — `a/b/notes.md` gives
  `["a", "b", "notes.md"]`; `Über.md` and `Mixed.Case.MD` keep their case.

Red evidence: paste the import failure before the module exists; then remove
rule 5 and paste the device-name red; remove rule 4 and paste the
alternate-stream red. Restore both.

## Allowed files
`src/shared/workspace/workspacePath.ts`, `test/unit/workspacePath.test.ts`.
Nothing else: no other src file, no IPC, no UI, no fixtures, no acceptance
docs, no coverage or lint config, no workflows, no package.json.

## Done means
typecheck, check:deps, test:unit and check:coverage exit 0 — paste each.
List the changed files. Paste the red evidence for both mutations.
