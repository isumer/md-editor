import type { DocumentReference } from "../../../shared/ipc/file";
import type { ServiceError } from "../../../shared/ipc/result";
import { formatMessage } from "../../../shared/messages/en";
import type { FeatureRegistration } from "../../editor/featureWiring";
import {
  chooseWorkspaceRoot,
  listWorkspaceChildren,
  openWorkspaceFile,
} from "../../platform/api";
import { WorkspaceTreeStore, type ChildrenRequest } from "./treeStore";

interface WorkspaceSidebarElements {
  readonly empty: HTMLElement;
  readonly filter: HTMLInputElement;
  readonly open: HTMLButtonElement;
  readonly title: HTMLElement;
  readonly tree: HTMLElement;
}

interface WorkspaceSidebarOptions {
  readonly elements: WorkspaceSidebarElements;
  openDocument(reference: DocumentReference): Promise<void>;
  showStatus(message?: string): void;
}

function errorText(error: ServiceError, file = "folder"): string {
  return formatMessage(error.messageKey, { file, ...error.params });
}

function rowPaths(rows: ReturnType<WorkspaceTreeStore["rows"]>): readonly string[] {
  const parents: string[] = [];
  return rows.map((row) => {
    parents.length = row.depth;
    const path = [...parents, row.name].join("/");
    if (row.kind === "folder") {
      parents[row.depth] = row.name;
    }
    return path;
  });
}

export class WorkspaceSidebar {
  private readonly store = new WorkspaceTreeStore((request) => {
    void this.loadChildren(request);
  });
  private filter = "";

  constructor(private readonly options: WorkspaceSidebarOptions) {
    options.elements.open.addEventListener("click", () => {
      void this.chooseRoot();
    });
    options.elements.filter.addEventListener("input", () => {
      this.filter = options.elements.filter.value;
      this.store.setFilter(this.filter);
      this.render();
    });
    options.elements.tree.addEventListener("click", (event) => {
      this.activateRow(event);
    });
  }

  private async chooseRoot(): Promise<void> {
    const result = await chooseWorkspaceRoot();
    if (!result.ok) {
      this.options.showStatus(errorText(result.error));
      return;
    }
    if (result.value === null) {
      return;
    }
    this.options.elements.title.textContent = result.value.name;
    this.options.elements.filter.value = "";
    this.filter = "";
    const request = this.store.openRoot();
    this.render();
    await this.loadChildren(request);
  }

  private async loadChildren(request: ChildrenRequest): Promise<void> {
    const result = await listWorkspaceChildren({ path: request.path });
    if (result.ok) {
      this.store.receiveChildren(request, result.value);
    } else {
      const message = errorText(result.error, request.path || "folder");
      this.store.failChildren(request, message);
      this.options.showStatus(message);
    }
    this.render();
  }

  private activateRow(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    const path = target.dataset["path"];
    if (path === undefined) {
      return;
    }
    if (target.dataset["kind"] === "folder") {
      const wasExpanded = this.store.isExpanded(path);
      this.store.toggle(path);
      const children = target.nextElementSibling;
      if (children instanceof HTMLDivElement && !this.store.isLoading(path)) {
        const expanded = !wasExpanded && children.childElementCount > 0;
        children.hidden = !expanded;
        target.setAttribute("aria-expanded", String(expanded));
      }
      return;
    }
    void this.openFile(path);
  }

  private async openFile(path: string): Promise<void> {
    const result = await openWorkspaceFile({ path });
    if (!result.ok) {
      this.options.showStatus(errorText(result.error, path));
      return;
    }
    await this.options.openDocument(result.value);
  }

  private render(): void {
    const rows = this.store.rows();
    const paths = rowPaths(rows);
    const fragment = document.createDocumentFragment();
    const containers: Array<HTMLElement | DocumentFragment> = [fragment];
    rows.forEach((row, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset["kind"] = row.kind;
      button.dataset["path"] = paths[index];
      button.dataset["testid"] = "workspace-row";
      button.className = `workspace-row workspace-${row.kind}`;
      button.style.paddingInlineStart = `${10 + row.depth * 16}px`;
      button.textContent = row.name;
      if (row.kind === "folder") {
        button.setAttribute("aria-expanded", String(row.expanded));
      }
      const container = containers[row.depth] ?? fragment;
      container.append(button);
      if (row.kind === "folder") {
        const children = document.createElement("div");
        children.dataset["childrenPath"] = paths[index];
        children.hidden = !row.expanded;
        container.append(children);
        containers[row.depth + 1] = children;
      }
    });
    this.options.elements.tree.replaceChildren(fragment);
    this.options.elements.empty.hidden = this.filter === "" || rows.length > 0;
  }
}

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

export const workspaceFeature: FeatureRegistration = {
  editorExtensions: [],
  create: ({ openDocument, showStatus }) => {
    new WorkspaceSidebar({
      elements: {
        empty: requiredElement<HTMLElement>("#workspace-empty"),
        filter: requiredElement<HTMLInputElement>("#workspace-filter"),
        open: requiredElement<HTMLButtonElement>("#workspace-open"),
        title: requiredElement<HTMLElement>("#workspace-title"),
        tree: requiredElement<HTMLElement>("#workspace-tree"),
      },
      openDocument,
      showStatus,
    });
    return {};
  },
};
