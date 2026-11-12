import {
  visibleRows,
  type WorkspaceNode,
  type WorkspaceRow,
} from "../../../shared/workspace/treeRows";
import {
  applyWorkspaceChange,
  type WorkspaceChange,
} from "../../../shared/workspace/treeUpdates";

export interface ChildrenRequest {
  readonly id: number;
  readonly path: string;
}

function isTreePath(path: string): boolean {
  if (path === "") {
    return false;
  }
  return path
    .split("/")
    .every(
      (segment) => segment !== "" && segment !== "." && segment !== "..",
    );
}

function findNode(
  nodes: readonly WorkspaceNode[],
  path: string,
): WorkspaceNode | undefined {
  let candidates = nodes;
  let found: WorkspaceNode | undefined;
  for (const segment of path.split("/")) {
    found = candidates.find((node) => node.name === segment);
    if (found === undefined) {
      return undefined;
    }
    candidates =
      found.kind === "folder" && found.children !== undefined
        ? found.children
        : [];
  }
  return found;
}

function replaceChildren(
  nodes: readonly WorkspaceNode[],
  segments: readonly string[],
  children: readonly WorkspaceNode[],
): readonly WorkspaceNode[] {
  const [segment, ...rest] = segments;
  return nodes.map((node) => {
    if (node.name !== segment || node.kind !== "folder") {
      return node;
    }
    const nextChildren =
      rest.length === 0
        ? [...children]
        : replaceChildren(node.children ?? [], rest, children);
    return { ...node, children: nextChildren };
  });
}

export class WorkspaceTreeStore {
  private readonly requestChildren: (request: ChildrenRequest) => void;
  private rootChildren: readonly WorkspaceNode[] = [];
  private readonly expanded = new Set<string>();
  private readonly pending = new Map<string, number>();
  private readonly errors = new Map<string, string>();
  private filter = "";
  private nextRequestId = 1;

  public constructor(requestChildren: (request: ChildrenRequest) => void) {
    this.requestChildren = requestChildren;
  }

  public openRoot(): ChildrenRequest {
    this.clearState();
    const request = this.newRequest("");
    this.pending.set("", request.id);
    return request;
  }

  public toggle(path: string): void {
    if (!isTreePath(path) || this.folderAt(path) === undefined) {
      return;
    }
    if (this.expanded.delete(path)) {
      return;
    }
    this.expanded.add(path);
    this.ensureChildren(path);
  }

  public setFilter(text: string): void {
    this.filter = text.trim();
  }

  public ensureChildren(path: string): boolean {
    if (!isTreePath(path)) {
      return false;
    }
    const folder = this.folderAt(path);
    if (
      folder === undefined ||
      folder.children !== undefined ||
      this.pending.has(path)
    ) {
      return false;
    }
    this.errors.delete(path);
    const request = this.newRequest(path);
    this.pending.set(path, request.id);
    this.requestChildren(request);
    return true;
  }

  public receiveChildren(
    request: ChildrenRequest,
    children: readonly WorkspaceNode[],
  ): boolean {
    if (!this.canApply(request)) {
      return false;
    }
    this.rootChildren =
      request.path === ""
        ? [...children]
        : replaceChildren(this.rootChildren, request.path.split("/"), children);
    this.pending.delete(request.path);
    this.errors.delete(request.path);
    return true;
  }

  public failChildren(request: ChildrenRequest, message: string): boolean {
    if (!this.canApply(request)) {
      return false;
    }
    this.pending.delete(request.path);
    this.errors.set(request.path, message);
    return true;
  }

  public rows(): readonly WorkspaceRow[] {
    return visibleRows(this.rootChildren, this.expanded, this.filter);
  }

  public applyChange(change: WorkspaceChange): void {
    this.rootChildren = applyWorkspaceChange(this.rootChildren, change);
  }

  public isExpanded(path: string): boolean {
    return this.expanded.has(path);
  }

  public isLoading(path: string): boolean {
    return isTreePath(path) && this.pending.has(path);
  }

  public childrenError(path: string): string | undefined {
    return this.errors.get(path);
  }

  public dispose(): void {
    this.clearState();
  }

  private folderAt(path: string): WorkspaceNode | undefined {
    const node = findNode(this.rootChildren, path);
    return node?.kind === "folder" ? node : undefined;
  }

  private canApply(request: ChildrenRequest): boolean {
    if (request.path !== "" && !isTreePath(request.path)) {
      return false;
    }
    if (this.pending.get(request.path) !== request.id) {
      return false;
    }
    return request.path === "" || this.folderAt(request.path) !== undefined;
  }

  private newRequest(path: string): ChildrenRequest {
    const request = { id: this.nextRequestId, path };
    this.nextRequestId += 1;
    return request;
  }

  private clearState(): void {
    this.rootChildren = [];
    this.expanded.clear();
    this.filter = "";
    this.pending.clear();
    this.errors.clear();
  }
}
