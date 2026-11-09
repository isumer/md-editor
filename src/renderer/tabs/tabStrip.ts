import { formatMessage } from "../../shared/messages/en";
import type { DocumentRecord } from "../core/document";

export function tabLabel(document: Pick<DocumentRecord, "name">): string {
  return document.name ?? "Untitled";
}

interface TabRow {
  close: HTMLButtonElement;
  dirty: HTMLSpanElement;
  element: HTMLDivElement;
  name: HTMLSpanElement;
}

export interface TabStripOptions {
  active(): DocumentRecord | null;
  close(document: DocumentRecord): void;
  documents(): readonly DocumentRecord[];
  host: HTMLElement;
  select(document: DocumentRecord): void;
  otherView?(document: DocumentRecord, action: "clone" | "move"): void;
}

export class TabStrip {
  private readonly rows = new Map<string, TabRow>();

  constructor(private readonly options: TabStripOptions) {}

  render(): void {
    this.options.host.replaceChildren();
    this.rows.clear();
    for (const document of this.options.documents()) {
      const row = this.createRow(document);
      this.options.host.append(row.element);
      this.rows.set(document.id, row);
    }
  }

  update(document: DocumentRecord): void {
    const row = this.rows.get(document.id);
    if (!row) {
      this.render();
      return;
    }
    const label = tabLabel(document);
    row.element.dataset["name"] = label;
    row.name.textContent = label;
    row.dirty.hidden = !document.dirty;
    row.close.setAttribute("aria-label", formatMessage("tab.close", { file: label }));
  }

  private createRow(document: DocumentRecord): TabRow {
    const element = window.document.createElement("div");
    const name = window.document.createElement("span");
    const dirty = window.document.createElement("span");
    const close = window.document.createElement("button");
    this.configureRow(element, document);
    name.className = "tab-name";
    name.textContent = tabLabel(document);
    dirty.className = "tab-dirty";
    dirty.dataset["testid"] = "tab-dirty";
    dirty.textContent = "•";
    dirty.hidden = !document.dirty;
    dirty.setAttribute("aria-label", formatMessage("tab.unsaved", {}));
    this.configureClose(close, document);
    element.append(name, dirty, close);
    return { close, dirty, element, name };
  }

  private configureRow(element: HTMLDivElement, document: DocumentRecord): void {
    element.className = "tab";
    element.dataset["testid"] = "tab";
    element.dataset["docId"] = document.id;
    element.dataset["name"] = tabLabel(document);
    element.setAttribute("role", "tab");
    element.setAttribute("aria-selected", String(document === this.options.active()));
    element.tabIndex = document === this.options.active() ? 0 : -1;
    element.addEventListener("click", () => this.options.select(document));
    element.addEventListener("mousedown", (event) => {
      if (event.button === 1) {
        event.preventDefault();
        this.options.close(document);
      }
    });
    element.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.openContextMenu(element, document);
    });
  }

  private openContextMenu(anchor: HTMLElement, document: DocumentRecord): void {
    window.document.querySelectorAll(".tab-context-menu").forEach((menu) => menu.remove());
    const menu = window.document.createElement("div");
    menu.className = "tab-context-menu";
    menu.setAttribute("role", "menu");
    menu.addEventListener("pointerdown", (event) => event.stopPropagation());
    for (const action of ["move", "clone"] as const) {
      const button = window.document.createElement("button");
      button.type = "button";
      button.textContent = action === "move" ? "Move to Other View" : "Clone to Other View";
      button.addEventListener("click", () => {
        menu.remove();
        this.options.otherView?.(document, action);
      });
      menu.append(button);
    }
    anchor.append(menu);
    window.document.addEventListener("pointerdown", () => menu.remove(), { once: true });
  }

  private configureClose(close: HTMLButtonElement, document: DocumentRecord): void {
    close.type = "button";
    close.className = "tab-close";
    close.dataset["testid"] = "tab-close";
    close.setAttribute("aria-label", formatMessage("tab.close", {
      file: tabLabel(document),
    }));
    close.textContent = "×";
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      this.options.close(document);
    });
  }
}
