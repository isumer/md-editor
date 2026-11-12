import type { DocumentReference } from "../../../shared/ipc/file";
import type { ServiceError } from "../../../shared/ipc/result";
import type { WorkspaceChangeMessage } from "../../../shared/ipc/workspace";
import { isDocumentDirty, type DocumentRecord } from "../../core/document";
import { formatMessage } from "../../core/messages";
import type { FeatureRegistration } from "../../editor/featureWiring";
import {
  chooseWorkspaceRoot,
  createWorkspaceFile,
  deleteWorkspaceFile,
  listWorkspaceChildren,
  loadSettings,
  onWorkspaceChange,
  openWorkspaceFile,
  renameWorkspaceFile,
  saveSettings,
} from "../../platform/api";
import { WorkspaceTreeStore, type ChildrenRequest } from "./treeStore";

interface WorkspaceSidebarElements {
  readonly empty: HTMLElement;
  readonly filter: HTMLInputElement;
  readonly open: HTMLButtonElement;
  readonly title: HTMLElement;
  readonly tree: HTMLElement;
  readonly sidebar: HTMLElement;
  readonly workspace: HTMLElement;
}

interface WorkspaceSidebarOptions {
  readonly elements: WorkspaceSidebarElements;
  documents(): readonly DocumentRecord[];
  openDocument(reference: DocumentReference): Promise<void>;
  removeDocument(document: DocumentRecord): void;
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

function requiredRowPath(row: HTMLButtonElement): string {
  const path = row.dataset["path"];
  if (path === undefined) throw new Error("Workspace row has no path");
  return path;
}

function isSidebarShortcut(event: KeyboardEvent): boolean {
  return event.code === "KeyB" && event.metaKey !== event.ctrlKey &&
    !event.altKey && !event.shiftKey;
}

export class WorkspaceSidebar {
  private readonly store = new WorkspaceTreeStore((request) => {
    void this.loadChildren(request);
  });
  private filter = "";
  private preferenceChanged = false;
  private settingsLoaded = false;
  private settings: Record<string, unknown> = {};

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
    options.elements.tree.addEventListener("contextmenu", (event) => {
      this.openActions(event);
    });
    document.addEventListener("keydown", (event) => {
      if (isSidebarShortcut(event)) {
        event.preventDefault();
        this.preferenceChanged = true;
        this.setOpen(options.elements.sidebar.hidden !== false);
      }
    });
    document.documentElement.dataset["sidebarShortcutReady"] = "true";
    if (document.documentElement.dataset["sidebarTogglePending"] === "true") {
      delete document.documentElement.dataset["sidebarTogglePending"];
      this.preferenceChanged = true;
      this.setOpen(options.elements.sidebar.hidden !== false);
    }
    onWorkspaceChange((change) => this.applyChange(change));
  }

  start(): void {
    void this.loadPreference();
  }

  private async loadPreference(): Promise<void> {
    const result = await loadSettings();
    if (!result.ok) return;
    const pendingOpen = this.settings["workspaceSidebarOpen"];
    this.settings = this.preferenceChanged
      ? { ...result.value, workspaceSidebarOpen: pendingOpen }
      : result.value;
    this.settingsLoaded = true;
    if (!this.preferenceChanged) {
      this.setOpen(result.value["workspaceSidebarOpen"] !== false, false);
    } else {
      this.persistPreference();
    }
  }

  private setOpen(open: boolean, persist = true): void {
    this.options.elements.sidebar.hidden = !open;
    this.options.elements.workspace.classList.toggle("sidebar-closed", !open);
    if (persist) {
      this.settings = { ...this.settings, workspaceSidebarOpen: open };
      this.persistPreference();
    }
  }

  private persistPreference(): void {
    if (!this.settingsLoaded) return;
    void saveSettings(this.settings).then((result) => {
      if (!result.ok) this.options.showStatus(errorText(result.error));
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

  private applyChange(change: WorkspaceChangeMessage): void {
    if (change.kind === "changed") {
      const row = [...this.options.elements.tree.querySelectorAll<HTMLButtonElement>(
        ".workspace-row",
      )].find((candidate) => candidate.dataset["path"] === change.path);
      if (row) {
        row.dataset["changed"] = "true";
        row.title = "Changed on disk";
      }
      return;
    }
    if (change.kind === "created") {
      this.store.applyChange(change);
      this.render();
    }
    if (change.kind === "deleted") {
      this.store.applyChange({ kind: "deleted", path: change.path });
      this.render();
    }
    if (change.kind !== "deleted") return;
    const open = this.options.documents().find((document) =>
      document.canonicalPath === change.canonicalPath);
    if (open && !isDocumentDirty(open)) this.options.removeDocument(open);
  }

  private openActions(event: MouseEvent): void {
    event.preventDefault();
    document.querySelector(".workspace-actions")?.remove();
    const row = event.target instanceof HTMLElement
      ? event.target.closest<HTMLButtonElement>(".workspace-row")
      : null;
    const menu = document.createElement("div");
    menu.className = "workspace-actions";
    menu.dataset["testid"] = "workspace-actions";
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    this.actionButton(menu, "New File", () => this.createFile(row));
    if (row?.dataset["kind"] === "file") {
      this.actionButton(menu, "Rename", () => this.renameFile(row));
      this.actionButton(menu, "Delete", () => this.deleteFile(row));
    }
    document.body.append(menu);
  }

  private actionButton(menu: HTMLElement, label: string, action: () => Promise<void>): void {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => {
      menu.remove();
      void action();
    });
    menu.append(button);
  }

  private async createFile(row: HTMLButtonElement | null): Promise<void> {
    const name = await this.requestAction("New file name", "Create", "");
    if (!name) return;
    const rowPath = row ? requiredRowPath(row) : "";
    const parent = row?.dataset["kind"] === "folder"
      ? rowPath
      : rowPath.split("/").slice(0, -1).join("/");
    const filePath = parent ? `${parent}/${name}` : name;
    const result = await createWorkspaceFile({ path: filePath });
    if (!result.ok) this.options.showStatus(errorText(result.error, filePath));
  }

  private async renameFile(row: HTMLButtonElement): Promise<void> {
    const oldPath = requiredRowPath(row);
    const oldName = oldPath.split("/").slice(-1).join("");
    const name = await this.requestAction("Rename file", "Rename", oldName);
    if (!name) return;
    const parent = oldPath.split("/").slice(0, -1).join("/");
    const newPath = parent ? `${parent}/${name}` : name;
    const result = await renameWorkspaceFile({ path: oldPath, newPath });
    if (!result.ok) this.options.showStatus(errorText(result.error, oldPath));
  }

  private async deleteFile(row: HTMLButtonElement): Promise<void> {
    const filePath = requiredRowPath(row);
    const fileName = filePath.split("/").slice(-1).join("");
    const confirmed = await this.requestAction(
      `Delete ${fileName}?`,
      "Delete",
      null,
    );
    if (confirmed === null) return;
    const result = await deleteWorkspaceFile({ path: filePath });
    if (!result.ok) this.options.showStatus(errorText(result.error, filePath));
  }

  private requestAction(
    title: string,
    action: string,
    initial: string | null,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const dialog = document.createElement("div");
      dialog.className = "workspace-prompt";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-label", title);
      let input: HTMLInputElement | null = null;
      if (initial !== null) {
        input = document.createElement("input");
        input.setAttribute("aria-label", title);
        input.value = initial;
        dialog.append(input);
      }
      const finish = (value: string | null): void => {
        dialog.remove();
        resolve(value);
      };
      const cancel = document.createElement("button");
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => finish(null));
      const accept = document.createElement("button");
      accept.textContent = action;
      accept.addEventListener("click", () => finish(input?.value ?? action));
      dialog.append(cancel, accept);
      document.body.append(dialog);
      input?.focus();
    });
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
      const container = containers[row.depth] as HTMLElement | DocumentFragment;
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
  create: ({ documents, openDocument, removeDocument, showStatus, workspace }) => {
    const sidebar = new WorkspaceSidebar({
      elements: {
        empty: requiredElement<HTMLElement>("#workspace-empty"),
        filter: requiredElement<HTMLInputElement>("#workspace-filter"),
        open: requiredElement<HTMLButtonElement>("#workspace-open"),
        title: requiredElement<HTMLElement>("#workspace-title"),
        tree: requiredElement<HTMLElement>("#workspace-tree"),
        sidebar: requiredElement<HTMLElement>("#workspace-sidebar"),
        workspace,
      },
      documents,
      openDocument,
      removeDocument,
      showStatus,
    });
    return { start: () => sidebar.start() };
  },
};
