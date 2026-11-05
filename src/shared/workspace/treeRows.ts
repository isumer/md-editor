export interface WorkspaceEntry {
  readonly name: string;
  readonly kind: "folder" | "file";
}

export interface WorkspaceNode extends WorkspaceEntry {
  readonly children?: readonly WorkspaceNode[];
}

export interface WorkspaceRow extends WorkspaceEntry {
  readonly depth: number;
  readonly expanded: boolean;
}

export const HIDDEN_FOLDER_NAMES: readonly string[] = [".git", "node_modules"];

function isHidden(node: WorkspaceNode): boolean {
  switch (node.kind) {
    case "folder":
      return HIDDEN_FOLDER_NAMES.includes(node.name) || node.name.startsWith(".");
    case "file":
      return !node.name.toLowerCase().endsWith(".md");
    default:
      return true;
  }
}

function matchesName(name: string, filterLower: string): boolean {
  return name.toLowerCase().includes(filterLower);
}

function hasMatchingDescendant(
  nodes: readonly WorkspaceNode[],
  filterLower: string,
): boolean {
  return nodes.some((node) => {
    if (isHidden(node)) {
      return false;
    }
    if (matchesName(node.name, filterLower)) {
      return true;
    }
    return (
      node.kind === "folder" &&
      node.children !== undefined &&
      hasMatchingDescendant(node.children, filterLower)
    );
  });
}

function isVisible(
  node: WorkspaceNode,
  inheritedMatch: boolean,
  filterLower: string,
): boolean {
  if (filterLower === "") {
    return true;
  }
  if (inheritedMatch || matchesName(node.name, filterLower)) {
    return true;
  }
  return (
    node.kind === "folder" &&
    node.children !== undefined &&
    hasMatchingDescendant(node.children, filterLower)
  );
}

function compareNodes(left: WorkspaceNode, right: WorkspaceNode): number {
  if (left.kind !== right.kind) {
    if (left.kind === "folder") {
      return -1;
    }
    if (right.kind === "folder") {
      return 1;
    }
  }
  return left.name.toLowerCase().localeCompare(right.name.toLowerCase(), "en");
}

function buildRows(
  nodes: readonly WorkspaceNode[],
  parentPath: string,
  depth: number,
  expanded: ReadonlySet<string>,
  filterLower: string,
  inheritedMatch: boolean,
): WorkspaceRow[] {
  const visibleNodes = nodes
    .filter((node) => !isHidden(node) && isVisible(node, inheritedMatch, filterLower))
    .sort(compareNodes);
  const rows: WorkspaceRow[] = [];

  for (const node of visibleNodes) {
    const path = parentPath === "" ? node.name : `${parentPath}/${node.name}`;
    if (node.kind !== "folder") {
      rows.push({ name: node.name, kind: node.kind, depth, expanded: false });
      continue;
    }

    const children = node.children ?? [];
    const isExpanded = expanded.has(path) && children.length > 0;
    rows.push({ name: node.name, kind: "folder", depth, expanded: isExpanded });
    if (isExpanded) {
      rows.push(
        ...buildRows(
          children,
          path,
          depth + 1,
          expanded,
          filterLower,
          inheritedMatch || matchesName(node.name, filterLower),
        ),
      );
    }
  }

  return rows;
}

export function visibleRows(
  nodes: readonly WorkspaceNode[],
  expanded: ReadonlySet<string>,
  filter: string,
): readonly WorkspaceRow[] {
  return buildRows(nodes, "", 0, expanded, filter.trim().toLowerCase(), false);
}
