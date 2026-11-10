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
  | "identical"
  | "changed"
  | "left-only"
  | "right-only"
  | "type-mismatch"
  | "binary-differs"
  | "error";

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

function isExcluded(path: string, excludedNames: ReadonlySet<string>): boolean {
  return path.split("/").some((segment) => excludedNames.has(segment));
}

function firstEntries(
  entries: readonly FolderEntry[],
  excludedNames: ReadonlySet<string>,
): ReadonlyMap<string, FolderEntry> {
  const byPath = new Map<string, FolderEntry>();
  for (const entry of entries) {
    if (!byPath.has(entry.path) && !isExcluded(entry.path, excludedNames)) {
      byPath.set(entry.path, entry);
    }
  }
  return byPath;
}

function blocksDescendants(
  left: FolderEntry | undefined,
  right: FolderEntry | undefined,
): boolean {
  if (left === undefined) {
    return right?.kind === "folder";
  }
  if (right === undefined) {
    return left.kind === "folder";
  }
  return left.kind !== right.kind;
}

function hasBlockingAncestor(
  path: string,
  leftByPath: ReadonlyMap<string, FolderEntry>,
  rightByPath: ReadonlyMap<string, FolderEntry>,
): boolean {
  let separator = path.indexOf("/");
  while (separator !== -1) {
    const ancestor = path.slice(0, separator);
    if (blocksDescendants(leftByPath.get(ancestor), rightByPath.get(ancestor))) {
      return true;
    }
    separator = path.indexOf("/", separator + 1);
  }
  return false;
}

function equalPresentKeys(
  left: string | undefined,
  right: string | undefined,
): boolean {
  return left !== undefined && right !== undefined && left === right;
}

function compareFilesByContents(
  left: FolderEntry,
  right: FolderEntry,
): FolderEntryStatus {
  if (left.error !== undefined || right.error !== undefined) {
    return "error";
  }
  if (left.binary === true && right.binary === true) {
    return equalPresentKeys(left.binaryKey, right.binaryKey)
      ? "identical"
      : "binary-differs";
  }
  return equalPresentKeys(left.textKey, right.textKey) ? "identical" : "changed";
}

function compareFiles(
  left: FolderEntry,
  right: FolderEntry,
  mode: FolderCompareMode,
): FolderEntryStatus {
  if (mode === "contents") {
    return compareFilesByContents(left, right);
  }
  return left.size === right.size && left.modifiedMs === right.modifiedMs
    ? "identical"
    : "changed";
}

function classifyPath(
  path: string,
  left: FolderEntry | undefined,
  right: FolderEntry | undefined,
  mode: FolderCompareMode,
): FolderCompareRow | undefined {
  if (left === undefined && right !== undefined) {
    const status = right.kind === "file" && right.error !== undefined ? "error" : "right-only";
    return { path, status, left, right };
  }
  if (right === undefined && left !== undefined) {
    const status = left.kind === "file" && left.error !== undefined ? "error" : "left-only";
    return { path, status, left, right };
  }
  if (left === undefined || right === undefined) {
    return undefined;
  }
  if (left.kind !== right.kind) {
    return { path, status: "type-mismatch", left, right };
  }
  if (left.kind === "folder") {
    return undefined;
  }
  return { path, status: compareFiles(left, right, mode), left, right };
}

function matchesInclude(path: string, include: RegExp | undefined): boolean {
  if (include === undefined) {
    return true;
  }
  include.lastIndex = 0;
  return include.test(path);
}

export function compareFolders(
  left: readonly FolderEntry[],
  right: readonly FolderEntry[],
  options: FolderCompareOptions,
): readonly FolderCompareRow[] {
  const excludedNames = new Set(options.exclude ?? []);
  const leftByPath = firstEntries(left, excludedNames);
  const rightByPath = firstEntries(right, excludedNames);
  const paths = [...new Set([...leftByPath.keys(), ...rightByPath.keys()])].sort(
    (first, second) => first.localeCompare(second, "en"),
  );
  const rows: FolderCompareRow[] = [];

  for (const path of paths) {
    if (hasBlockingAncestor(path, leftByPath, rightByPath)) {
      continue;
    }
    const row = classifyPath(path, leftByPath.get(path), rightByPath.get(path), options.mode);
    if (
      row !== undefined &&
      matchesInclude(path, options.include) &&
      (!options.onlyDifferences || row.status !== "identical")
    ) {
      rows.push(row);
    }
  }
  return rows;
}
