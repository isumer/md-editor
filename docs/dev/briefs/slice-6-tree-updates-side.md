# Slice 6 module part — apply workspace changes (dev lane)

Base: main

A pure module that applies a file-system change to a workspace tree and
decides what happens to an open file. Slice 6 wiring consumes it later
(dev lane). This item adds no wiring, no IPC and no UI. Criterion
AC-R11-05 in `docs/acceptance/R11-workspace-sidebar.md` is planned; do
not edit it. No new dependencies.

## The module
New file `src/shared/workspace/treeUpdates.ts`. Import the node type only:
`import type { WorkspaceNode } from './treeRows';`. A node has `name`,
`kind` and optional `children`; it has no `path` field. Derive a node's
path by joining its ancestor names with `/`. Exports exactly:
- `export type WorkspaceChange = { readonly kind: 'created'; readonly path: string; readonly entryKind: 'folder' | 'file' } | { readonly kind: 'deleted'; readonly path: string };`
- `export type OpenFileDecision = 'close' | 'keep';`
- `export function applyWorkspaceChange(nodes: readonly WorkspaceNode[], change: WorkspaceChange): readonly WorkspaceNode[]`
- `export function decideOpenFile(change: WorkspaceChange, openPath: string, dirty: boolean): OpenFileDecision`

Rules, in this order:
1. A path is `/`-separated and relative to the workspace root. It has no
   leading or trailing `/` and no empty, `.` or `..` segment. A path that
   breaks this rule leaves the tree unchanged.
2. `applyWorkspaceChange` does not mutate its input. It keeps every node
   object it does not change and returns new arrays and new parent nodes
   only on the changed path.
3. `created`: add the entry to its parent folder only when the parent
   exists and already has a `children` array. Add nothing when an entry
   with that path is already present. Keep the same order as
   `visibleRows`: folders before files, then by name compared
   case-insensitively with `localeCompare(..., 'en')`. A created folder
   has no `children`.
4. `deleted`: remove the entry whose path equals `change.path`, with all
   of its descendants. Remove nothing when the path is absent.
5. `decideOpenFile` returns `'close'` only when the change is `deleted`,
   the open path equals the deleted path or starts with it plus `/`, and
   `dirty` is false. It returns `'keep'` for every other case.

## Tests (`test/unit/workspaceTreeUpdates.test.ts`)
Every title starts `AC-R11-05:`. Build trees as plain objects.
- `adds a created file in tree order` — insert `b.md` between `a.md`
  and `c.md`.
- `adds a created folder before files` — a folder name sorts before
  files at the same level.
- `adds a created entry under a nested folder` — the parent chain is
  rebuilt and the other folders keep their object identity.
- `does not add a duplicate or a missing parent` — an existing path and
  a path whose parent is absent both return the input tree unchanged.
- `refuses an invalid path` — a leading `/`, a trailing `/`, an empty
  segment and a `..` segment each leave the tree unchanged.
- `removes a deleted file` — the row is gone and its parent is new.
- `removes a deleted folder with its descendants` — the whole subtree
  is gone.
- `removes nothing for an absent path`.
- `does not mutate its input` — `Object.freeze` the tree and the change.
- `closes only a deleted clean file` — an open dirty file stays
  `'keep'`; a clean file inside a deleted folder is `'close'`; any
  `created` change is `'keep'`.

Red evidence: run the tests before the module exists (import fails),
then with rule 3's order comparison removed so the created file appends
last (the order tests go red). Paste both.

## Allowed files
src/shared/workspace/treeUpdates.ts, test/unit/workspaceTreeUpdates.test.ts.
Nothing else — no other src file, no fixtures, no acceptance docs, no
coverage config, no workflows.

## Done means
`npm run typecheck`, `npm run check:deps`, `npm run test:unit` exit 0 —
paste. List changed files. Paste the red evidence.
