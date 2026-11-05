# Slice 6 module part 1 — workspace tree rows

Base: main

A pure module that turns a folder's listing into the visible tree rows.
Slice 6 wiring (io-worker listing, watcher, panel, file actions) comes later
in the dev lane; this item adds no wiring, no IPC and no UI. Criteria
AC-R11-01 to AC-R11-03 are in `docs/acceptance/R11-workspace-sidebar.md`
(`status: planned`; do not edit them). No new dependencies.

## The module
New file `src/shared/workspace/treeRows.ts`. No imports. Export exactly:
- `export interface WorkspaceEntry { readonly name: string; readonly kind: "folder" | "file"; }`
- `export interface WorkspaceNode extends WorkspaceEntry { readonly children?: readonly WorkspaceNode[]; }`
- `export interface WorkspaceRow extends WorkspaceEntry { readonly depth: number; readonly expanded: boolean; }`
- `export const HIDDEN_FOLDER_NAMES: readonly string[]` — `[".git", "node_modules"]`.
- `export function visibleRows(nodes, expanded, filter): readonly WorkspaceRow[]`
  where `nodes` is the root's loaded nodes, `expanded` is a `ReadonlySet<string>`
  of folder paths, and `filter` is a string.

Rules:
1. Hide a folder whose name is in `HIDDEN_FOLDER_NAMES` or starts with `.`.
   Hide a file whose name does not end in `.md` (compare case-insensitively).
   Hide any other kind.
2. Sort inside each level: folders before files, then by name with
   `toLowerCase()` compared by `localeCompare` with the `"en"` locale; equal
   names keep the input order.
3. A row's `depth` is 0 for a root entry and one more than its parent's depth.
4. `expanded` holds folder paths joined with `/` from the root names. A folder
   row is expanded only when its path is in `expanded` and it has `children`.
   A collapsed folder shows its own row and no child rows.
5. `filter` is trimmed. An empty filter matches everything. Otherwise a name
   matches when its lower-case form contains the lower-case filter; an
   ancestor folder stays visible when any descendant file matches. A folder
   whose name matches keeps its children visible.
6. The function must not mutate `nodes`, `expanded` or `filter`, and must not
   read the filesystem.

## Tests (`test/unit/workspaceTreeRows.test.ts`)
Every test title starts with its criterion id. Build trees in the test; do
not add fixtures.
- `AC-R11-01: hides node_modules and dot folders` — a folder named
  `node_modules` and one named `.git` are absent; a `.md` file is present.
- `AC-R11-01: lists folders before files and other files are hidden` —
  `b.md`, `a/`, `z.txt`; rows are `a/` then `b.md`, and `z.txt` is absent.
- `AC-R11-01: sets the depth from the nesting level` — an expanded folder's
  child is depth 1, its expanded grandchild depth 2.
- `AC-R11-02: a collapsed folder shows no child rows` — an unexpanded folder
  with children yields one row.
- `AC-R11-02: an expanded folder shows its children once with their paths` —
  an expanded folder yields its children; a nested expanded folder works.
- `AC-R11-03: matches names case-insensitively` — filter `NOTE` keeps
  `notes.md`.
- `AC-R11-03: keeps an ancestor folder visible for a matching file` — a
  matching file two levels down keeps both ancestor folders.
- `AC-R11-03: a folder whose name matches keeps its children` — filter `src`
  keeps `src/` and both of its children.
- `AC-R11-03: no match yields no rows` and a blank filter yields every row.
- `AC-R11-01: does not mutate its inputs` — pass a frozen node array and a
  frozen set; the call must not throw.

Red evidence: the test file fails to import before the module exists; then
remove rule 1's hidden-folder check and paste the AC-R11-01 red; remove
rule 5's ancestor rule and paste the AC-R11-03 red.

## Allowed files
`src/shared/workspace/treeRows.ts`, `test/unit/workspaceTreeRows.test.ts`.
Nothing else — no other src file, no IPC, no UI, no fixtures, no acceptance
docs, no coverage or lint config, no workflows, no package.json.

## Done means
typecheck, check:deps, test:unit, check:coverage exit 0 — paste; list the
changed files; paste the red evidence for both mutations.
