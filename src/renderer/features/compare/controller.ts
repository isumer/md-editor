import "./compare.css";

import type { CompareRequest, CompareResponse } from "./contracts";
import {
  moveToDifference,
  type CompareCell,
  type CompareRow,
  type CompareViewState,
} from "./viewState";

export interface CompareDocument {
  readonly name: string;
  readonly text: string;
}

export interface CompareControllerOptions {
  readonly workspace: HTMLElement;
  readonly editor: HTMLElement;
  readonly preview: HTMLElement;
  readonly previewError: HTMLElement;
  readonly workerUrl: URL;
  readonly previousLabel: string;
  readonly nextLabel: string;
  readonly highlightLabel: string;
  readonly highlightOptions: Readonly<Record<HighlightMode, string>>;
  readonly onError: (message: string) => void;
}

type HighlightMode = "words" | "characters" | "lines" | "none";

function spanElement(kind: "same" | "changed", text: string): HTMLElement {
  const element = document.createElement(kind === "changed" ? "mark" : "span");
  if (kind === "changed") element.dataset.testid = "changed-word";
  element.textContent = text;
  return element;
}

function displaySpans(
  cell: CompareCell,
  mode: HighlightMode,
  changed: boolean,
): readonly { readonly kind: "same" | "changed"; readonly text: string }[] {
  if (mode === "none" || !changed) return [{ kind: "same", text: cell.text }];
  if (mode === "lines") return [{ kind: "changed", text: cell.text }];
  return mode === "characters" ? cell.characterSpans : cell.spans;
}

function cellElement(
  cell: CompareCell | undefined,
  mode: HighlightMode,
  changed: boolean,
): HTMLElement {
  const element = document.createElement("div");
  element.className = "compare-cell";
  const number = document.createElement("span");
  number.className = "compare-line-number";
  number.textContent = cell === undefined ? "" : String(cell.lineNumber);
  const code = document.createElement("code");
  code.className = "compare-code";
  for (const span of cell === undefined ? [] : displaySpans(cell, mode, changed)) {
    code.append(spanElement(span.kind, span.text));
  }
  element.append(number, code);
  return element;
}

function rowElement(row: CompareRow, mode: HighlightMode): HTMLElement {
  const element = document.createElement("div");
  element.className = "compare-row";
  element.dataset.changeKind = row.kind;
  if (row.difference !== undefined) {
    element.dataset.difference = String(row.difference);
  }
  const changed = row.kind !== "unchanged";
  element.append(
    cellElement(row.left, mode, changed),
    cellElement(row.right, mode, changed),
  );
  return element;
}

function titleElement(name: string, testId: string): HTMLElement {
  const title = document.createElement("div");
  title.className = "compare-title";
  title.dataset.testid = testId;
  title.textContent = name;
  return title;
}

export class CompareController {
  private readonly worker: Worker;
  private requestId = 0;
  private host: HTMLElement | null = null;
  private rows: HTMLElement | null = null;
  private overview: HTMLElement | null = null;
  private state: CompareViewState | null = null;
  private highlightMode: HighlightMode = "words";

  constructor(private readonly options: CompareControllerOptions) {
    this.worker = new Worker(options.workerUrl, { type: "module" });
    this.worker.onmessage = (event: MessageEvent<CompareResponse>) => {
      this.receive(event.data);
    };
    this.worker.onerror = (event): void => options.onError(event.message);
    document.addEventListener("keydown", (event) => this.keydown(event), true);
  }

  open(left: CompareDocument, right: CompareDocument): void {
    this.close();
    this.requestId += 1;
    this.state = null;
    this.host = this.createHost(left.name, right.name);
    this.options.workspace.append(this.host);
    this.setWorkspaceHidden(true);
    const request: CompareRequest = {
      id: this.requestId,
      left: left.text.split("\n"),
      right: right.text.split("\n"),
    };
    this.worker.postMessage(request);
  }

  close(): void {
    this.requestId += 1;
    this.host?.remove();
    this.host = null;
    this.rows = null;
    this.overview = null;
    this.state = null;
    this.setWorkspaceHidden(false);
  }

  private createHost(leftName: string, rightName: string): HTMLElement {
    const host = document.createElement("section");
    host.className = "compare-view";
    host.dataset.testid = "compare-view";
    host.setAttribute("aria-label", "File comparison");
    const toolbar = document.createElement("header");
    toolbar.className = "compare-toolbar";
    const navigation = this.createNavigation();
    toolbar.append(
      titleElement(leftName, "compare-left-title"),
      navigation,
      titleElement(rightName, "compare-right-title"),
    );
    this.rows = document.createElement("div");
    this.rows.className = "compare-rows";
    this.overview = document.createElement("div");
    this.overview.className = "compare-overview";
    this.overview.setAttribute("aria-label", "Difference overview");
    host.append(toolbar, this.rows, this.overview);
    return host;
  }

  private createNavigation(): HTMLElement {
    const navigation = document.createElement("nav");
    navigation.className = "compare-navigation";
    for (const [label, direction] of [
      [this.options.previousLabel, -1],
      [this.options.nextLabel, 1],
    ] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => this.move(direction));
      navigation.append(button);
    }
    const select = document.createElement("select");
    select.setAttribute("aria-label", this.options.highlightLabel);
    for (const mode of ["words", "characters", "lines", "none"] as const) {
      const option = document.createElement("option");
      option.value = mode;
      option.textContent = this.options.highlightOptions[mode];
      select.append(option);
    }
    select.addEventListener("change", () => {
      this.highlightMode = select.value as HighlightMode;
      this.renderRows();
    });
    navigation.append(select);
    return navigation;
  }

  private receive(response: CompareResponse): void {
    if (response.id !== this.requestId || this.host === null) return;
    if (!response.ok) {
      this.options.onError(response.message);
      return;
    }
    this.state = response.state;
    this.renderRows();
  }

  private renderRows(): void {
    if (this.rows === null || this.state === null) return;
    this.rows.replaceChildren(
      ...this.state.rows.map((row) => rowElement(row, this.highlightMode)),
    );
    this.renderOverview();
    this.updateActiveDifference();
  }

  private renderOverview(): void {
    if (this.overview === null || this.state === null) return;
    const markers: HTMLElement[] = [];
    for (let difference = 0; difference < this.state.changeCount; difference += 1) {
      const rowIndex = this.state.rows.findIndex((row) => row.difference === difference);
      const marker = document.createElement("button");
      marker.type = "button";
      marker.dataset.testid = "compare-overview-marker";
      marker.dataset.difference = String(difference);
      marker.style.top = `${100 * rowIndex / Math.max(1, this.state.rows.length)}%`;
      marker.setAttribute("aria-label", `Difference ${String(difference + 1)}`);
      marker.addEventListener("click", () => this.selectDifference(difference));
      markers.push(marker);
    }
    this.overview.replaceChildren(...markers);
  }

  private move(direction: 1 | -1): void {
    if (this.state === null) return;
    this.state = moveToDifference(this.state, direction);
    this.updateActiveDifference();
  }

  private selectDifference(difference: number): void {
    if (this.state === null) return;
    this.state = { ...this.state, activeDifference: difference };
    this.updateActiveDifference();
  }

  private updateActiveDifference(): void {
    if (this.rows === null || this.state === null) return;
    for (const row of this.rows.querySelectorAll<HTMLElement>("[data-difference]")) {
      row.dataset.activeDifference = String(
        row.dataset.difference === String(this.state.activeDifference),
      );
    }
    for (const marker of this.overview?.querySelectorAll<HTMLElement>("[data-difference]") ?? []) {
      marker.dataset.activeDifference = String(
        marker.dataset.difference === String(this.state.activeDifference),
      );
    }
    const active = this.rows.querySelector<HTMLElement>('[data-active-difference="true"]');
    active?.scrollIntoView({ block: "center" });
    active?.setAttribute("tabindex", "-1");
    active?.focus({ preventScroll: true });
  }

  private keydown(event: KeyboardEvent): void {
    if (this.host === null || event.key !== "F7" || event.altKey ||
      event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    this.move(event.shiftKey ? -1 : 1);
  }

  private setWorkspaceHidden(hidden: boolean): void {
    this.options.editor.hidden = hidden;
    this.options.preview.hidden = hidden;
    this.options.previewError.hidden = hidden || this.options.previewError.textContent === "";
  }
}
