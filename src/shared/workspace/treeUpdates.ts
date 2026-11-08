// Shared modules have no imports (depcruise shared-no-dependencies), so this
// mirrors the treeRows node shape structurally.
interface WorkspaceNode {
  readonly name: string;
  readonly kind: "folder" | "file";
  readonly children?: readonly WorkspaceNode[];
}

type FolderNode = WorkspaceNode & { readonly children: readonly WorkspaceNode[] };

export type WorkspaceChange =
  | {
      readonly kind: "created";
      readonly path: string;
      readonly entryKind: "folder" | "file";
    }
  | { readonly kind: "deleted"; readonly path: string };

export type OpenFileDecision = "close" | "keep";

function pathSegments(path: string): readonly string[] | undefined {
  if (path.startsWith("/") || path.endsWith("/")) {
    return undefined;
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return undefined;
  }
  return segments;
}

function compareNodes(left: WorkspaceNode, right: WorkspaceNode): number {
  if (left.kind !== right.kind) {
    return left.kind === "folder" ? -1 : 1;
  }
  return left.name.toLowerCase().localeCompare(right.name.toLowerCase(), "en");
}

function addEntry(
  nodes: readonly WorkspaceNode[],
  name: string,
  kind: "folder" | "file",
): readonly WorkspaceNode[] {
  if (nodes.some((node) => node.name === name)) {
    return nodes;
  }
  return [...nodes, { name, kind }].sort(compareNodes);
}

function createAtPath(
  nodes: readonly WorkspaceNode[],
  segments: readonly string[],
  index: number,
  entryKind: "folder" | "file",
): readonly WorkspaceNode[] {
  // The path guard rejects empty paths and the recursion stops before the last
  // segment, so every index is in range.
  const name = segments[index] as string;
  if (index === segments.length - 1) {
    return addEntry(nodes, name, entryKind);
  }
  const parentIndex = nodes.findIndex(
    (node) => node.name === name && node.kind === "folder" && node.children !== undefined,
  );
  // findIndex selects only a folder that already has children.
  const parent = nodes[parentIndex] as FolderNode | undefined;
  if (parent === undefined) {
    return nodes;
  }
  const children = createAtPath(parent.children, segments, index + 1, entryKind);
  if (children === parent.children) {
    return nodes;
  }
  return nodes.map((node, nodeIndex) =>
    nodeIndex === parentIndex ? { ...parent, children } : node,
  );
}

function deleteAtPath(
  nodes: readonly WorkspaceNode[],
  segments: readonly string[],
  index: number,
): readonly WorkspaceNode[] {
  // See createAtPath: every index is in range.
  const name = segments[index] as string;
  if (index === segments.length - 1) {
    const targetIndex = nodes.findIndex((node) => node.name === name);
    return targetIndex === -1
      ? nodes
      : [...nodes.slice(0, targetIndex), ...nodes.slice(targetIndex + 1)];
  }
  const parentIndex = nodes.findIndex(
    (node) => node.name === name && node.kind === "folder" && node.children !== undefined,
  );
  // findIndex selects only a folder that already has children.
  const parent = nodes[parentIndex] as FolderNode | undefined;
  if (parent === undefined) {
    return nodes;
  }
  const children = deleteAtPath(parent.children, segments, index + 1);
  if (children === parent.children) {
    return nodes;
  }
  return nodes.map((node, nodeIndex) =>
    nodeIndex === parentIndex ? { ...parent, children } : node,
  );
}

export function applyWorkspaceChange(
  nodes: readonly WorkspaceNode[],
  change: WorkspaceChange,
): readonly WorkspaceNode[] {
  const segments = pathSegments(change.path);
  if (segments === undefined) {
    return nodes;
  }
  if (change.kind === "created") {
    return createAtPath(nodes, segments, 0, change.entryKind);
  }
  return deleteAtPath(nodes, segments, 0);
}

export function decideOpenFile(
  change: WorkspaceChange,
  openPath: string,
  dirty: boolean,
): OpenFileDecision {
  if (change.kind !== "deleted" || dirty) {
    return "keep";
  }
  return openPath === change.path || openPath.startsWith(`${change.path}/`)
    ? "close"
    : "keep";
}
