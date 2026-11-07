# Slice 10 part — folder compare classification (dev lane)

Base: main

A pure module that classifies the entries of two folder trees. Slice 10
wiring reads the trees and calls it later. This item adds no file-system
access, no IPC and no UI. AC-R14-12, -14 and -15 stay `planned`. No new
dependencies.

## Allowed files
New files only:
- `src/shared/diff/folderCompare.ts`
- `test/unit/folderCompare.test.ts`

Change no other file. `src/shared` modules have zero imports, so
`folderCompare.ts` imports nothing. Do not read `test/fixtures/**`; build
the test entries as plain objects.

## Types
Export exactly these types and the function from `folderCompare.ts`.

```ts
export interface FolderEntry {
  readonly path: string;
  readonly kind: "file" | "folder";
  readonly size?: number;
  readonly modifiedMs?: number;
  readonly textKey?: string;
  readonly binaryKey?: string;
  readonly binary?: boolean;
  readonly error?: string;
}
export type FolderCompareMode = "contents" | "size-and-timestamp";
export type FolderEntryStatus =
  | "identical" | "changed" | "left-only" | "right-only"
  | "type-mismatch" | "binary-differs" | "error";
export interface FolderCompareRow {
  readonly path: string;
  readonly status: FolderEntryStatus;
  readonly left: FolderEntry | undefined;
  readonly right: FolderEntry | undefined;
}
export interface FolderCompareOptions {
  readonly mode: FolderCompareMode;
  readonly onlyDifferences?: boolean;
  readonly include?: RegExp;
  readonly exclude?: readonly string[];
}
export function compareFolders(
  left: readonly FolderEntry[],
  right: readonly FolderEntry[],
  options: FolderCompareOptions,
): readonly FolderCompareRow[];
```

## Rules
1. A path is `/`-separated and relative. It has no leading or trailing
   `/` and no empty, `.` or `..` segment. Ignore a later duplicate path in
   one input list and keep the first.
2. Walk both lists by path. Report one row per path that is present in
   either list, except a folder present on both sides.
3. Both sides present, kinds differ: `type-mismatch`. Do not report any
   path below the folder side.
4. Both sides are folders: report no row.
5. Both sides are files, `size-and-timestamp` mode: equal `size` and
   equal `modifiedMs` give `identical`, otherwise `changed`. Do not read
   `textKey`, `binaryKey` or `binary`.
6. Both sides are files, `contents` mode:
   - either entry has `error` set: `error`;
   - both entries have `binary === true`: equal `binaryKey` gives
     `identical`, otherwise `binary-differs`;
   - otherwise: equal `textKey` gives `identical`, otherwise `changed`.
   A missing key counts as unequal.
7. One side present: `left-only` or `right-only`. Report a folder once
   and do not report its descendants. An `error` on a present file gives
   `error`.
8. Order rows by `path` with `localeCompare(other.path, "en")`.
9. `exclude` lists names. A path is excluded when any segment equals one
   name. Report neither the excluded entry nor its descendants.
10. `include`, when present, keeps only rows whose full path matches it.
    Reset `lastIndex` to 0 before each test so a `g` flag cannot carry
    state. Do not add ancestor rows.
11. `onlyDifferences` drops `identical` rows. The default is false.
12. Do not mutate either input list or any entry.

## Tests (`test/unit/folderCompare.test.ts`)
Every title starts `AC-R14-12:`, `AC-R14-14:` or `AC-R14-15:`.
- `AC-R14-12: classifies every entry of two small trees` — changed,
  identical, left-only, right-only, a folder on both sides that is not
  reported, and a file-versus-folder `type-mismatch` with no row below
  the mismatch.
- `AC-R14-12: reports an unreadable entry as error` — `error` wins on
  either side, and a one-sided file with `error` gives `error`.
- `AC-R14-12: compares binary files by their binary key` — equal keys
  give `identical`; different keys give `binary-differs`; one binary and
  one text file compare by `textKey`.
- `AC-R14-12: orders rows by path`.
- `AC-R14-14: size-and-timestamp mode reads no content` — equal size and
  `modifiedMs`, different keys and a throwing getter on `textKey`,
  `binaryKey` and `binary` all give `identical`.
- `AC-R14-14: size-and-timestamp mode reports a size or timestamp
  change` — one differing field gives `changed`.
- `AC-R14-15: excludes folders and their descendants` — `.git` and
  `node_modules` never appear, and a nested match is removed too.
- `AC-R14-15: keeps only matching rows and only differences` — `include`
  and `onlyDifferences` filter independently and together.
- `does not mutate its input` — freeze both lists and the entries.

Red evidence: break rule 3, rule 5 and rule 9 once each, confirm a test
goes red, and restore the line. Paste all three runs.

## Done means
`npm run typecheck`, `npm run check:deps` and `npm run test:unit` exit 0
— paste. List changed files. Paste the red evidence. Do not change the
coverage baseline, acceptance files or workflows.
