# Slice 6 module part — workspace tree store (Vision lane)

Base: main

A renderer-side state store for the workspace sidebar tree. Slice 6 wires
it to IPC, the DOM and Open Folder later (separate dev item). This item
adds no wiring, no IPC and no UI. Criteria AC-R11-01, AC-R11-02 and
AC-R11-03 in `docs/acceptance/R11-workspace-sidebar.md` are planned; do
not edit them. No new dependencies. Commit after each step. Show a red
test first (AGENTS.md).

## The module
New file `src/renderer/features/workspace/treeStore.ts`. Import only from
`../../../shared/workspace/treeRows` (`visibleRows` and the node and row
types). Export exactly:
- `export interface ChildrenRequest { readonly id: number; readonly path: string }` (`path` is `""` for the workspace root)
- `export class WorkspaceTreeStore` with a constructor `constructor(requestChildren: (request: ChildrenRequest) => void)` and the methods below.

Methods:
- `openRoot(): ChildrenRequest`
- `toggle(path: string): void`
- `setFilter(text: string): void`
- `ensureChildren(path: string): boolean`
- `receiveChildren(request: ChildrenRequest, children: readonly WorkspaceNode[]): boolean`
- `failChildren(request: ChildrenRequest, message: string): boolean`
- `rows(): readonly WorkspaceRow[]`
- `isExpanded(path: string): boolean`
- `isLoading(path: string): boolean`
- `childrenError(path: string): string | undefined`
- `dispose(): void`

Rules:
1. A tree path is `/`-separated and relative to the workspace root. It has
   no leading or trailing `/` and no empty, `.` or `..` segment. Only
   `openRoot` uses the empty path. `toggle` with an invalid path does
   nothing; `ensureChildren` and `receiveChildren` with an invalid path
   return `false`.
2. `openRoot` resets the store: no root children, no expanded paths, an
   empty filter, no loading state and no errors. It returns a new request
   with the next id and path `""`. The caller sends that request.
3. `toggle` flips the expanded flag for a path that names a folder in the
   loaded tree and does nothing for any other path. Expanding calls
   `ensureChildren(path)`. Collapsing keeps loaded children.
4. `ensureChildren` returns `false` when the path is invalid, is not a
   folder, already has `children`, or already has a pending request. In
   every other case it clears the stored error, marks the path as loading,
   calls `requestChildren` once with the next id, and returns `true`. A
   folder without a `children` array is not loaded; a folder with an empty
   `children` array is loaded.
5. `receiveChildren` applies only when the request id is the pending id for
   `request.path` and the target still exists: path `""` replaces the root
   children; any other path must name a folder. On apply it stores the
   children, clears loading, clears the error and returns `true`. A stale,
   unknown or forged request returns `false` and changes nothing.
6. `failChildren` applies under the same id rule in rule 5. On apply it
   clears loading, stores `message` for that path and returns `true`. The
   next `ensureChildren` for that path retries.
7. `rows` returns `visibleRows(rootChildren, expanded, filter)`. It does
   not add rows for loading or error state; the view reads
   `isLoading` and `childrenError` for each folder row.
8. `dispose` clears all state. A later `receiveChildren` or `failChildren`
   for an outstanding request returns `false`.
9. Keep every received node object unchanged; build new arrays and new
   parent nodes only on the changed path. Do not mutate a frozen input.

## Tests (`test/unit/workspaceTreeStore.test.ts`)
Every title starts with one of `AC-R11-01:`, `AC-R11-02:` or
`AC-R11-03:`. Pass a fake `requestChildren` that records requests. Build
trees as plain objects.

AC-R11-01 (lazy tree):
- `AC-R11-01: lists only folders and markdown files with folders first` —
  receive a root with `docs` (folder), `a.md`, `b.txt`, `node_modules`
  and `.git`; `rows()` gives `docs` then `a.md`.
- `AC-R11-01: loads a folder's children only when it expands` — after the
  root arrives, one request is recorded. `toggle("docs")` records a second
  request for `docs`, sets `isLoading("docs")` and leaves `rows()` without
  the child. `receiveChildren` adds the child row and clears loading.
- `AC-R11-01: rejects a stale root reply after a second Open Folder` —
  `openRoot` twice; the first request is rejected and the second is
  applied.
- `AC-R11-01: does not mutate the nodes it receives` — freeze the root
  and its nodes; expand and receive children without throwing.

AC-R11-02 (cache):
- `AC-R11-02: reuses loaded children after collapse and expand` — expand,
  receive, collapse and expand again: no new request and `isLoading` is
  false.
- `AC-R11-02: does not request an unloaded file or an unknown path` —
  `ensureChildren("a.md")`, `ensureChildren("missing")` and an invalid
  path each return `false` and record no request.
- `AC-R11-02: retries after a failed listing` — `failChildren` stores the
  message and clears loading; collapsing and expanding sends a new
  request and clears the error.

AC-R11-03 (filter):
- `AC-R11-03: filters case-insensitively and keeps ancestor folders` —
  expand `docs` and `notes`; filter `GUI` shows `docs` and its
  `guide.md` row only.
- `AC-R11-03: trims the filter and restores all rows when it is empty`.
- `AC-R11-03: returns no rows when nothing matches`.

Red evidence: run the tests before the module exists (import fails), then
remove the "children already loaded" check in `ensureChildren` (the reuse
test goes red), then remove the pending-id check in `receiveChildren`
(the stale-reply test goes red). Paste all three.

## Allowed files
`src/renderer/features/workspace/treeStore.ts`,
`test/unit/workspaceTreeStore.test.ts`. Nothing else: no other src file,
no fixtures, no acceptance docs, no coverage config, no package.json, no
workflows.

## Done means
`npm run typecheck`, `npm run check:deps`, `npm run test:unit` and
`npm run check:coverage` exit 0: paste each. List the changed files.
Paste the red evidence.
