import type {
  CompareRow,
  CompareSide,
  CompareState,
  HighlightMode,
} from "../../../shared/workers/compare";
import { formatMessage } from "../../core/messages";

export interface CompareViewActions {
  applyChange?(changeIndex: number): void;
  close(): void;
  compareClipboard?(): void;
  compareSaved?(): void;
  highlight(mode: HighlightMode): void;
  move(direction: 1 | -1): void;
}

type CompareMode = "side-by-side" | "unified";
interface CompareRenderContext {
  readonly actions: CompareViewActions;
  readonly allowApply: boolean;
  readonly mode: CompareMode;
  readonly selected: number;
  readonly shownChanges: Set<number>;
}
const CONTEXT_LINE_COUNT = 3;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.className = className;
  return result;
}

function button(label: string, action: () => void): HTMLButtonElement {
  const result = element("button", "compare-button");
  result.type = "button";
  result.textContent = label;
  result.addEventListener("click", action);
  return result;
}

function toolbar(actions: CompareViewActions, toggleMode: () => void): HTMLElement {
  const result = element("header", "compare-toolbar");
  const label = element("label", "compare-highlight-label");
  label.textContent = formatMessage("compare.highlight", {});
  const select = element("select", "compare-highlight");
  select.dataset.testid = "compare-highlight";
  for (const mode of ["words", "characters", "lines", "none"] as const) {
    const option = document.createElement("option");
    option.value = mode;
    option.textContent = formatMessage(`compare.highlight.${mode}`, {});
    select.append(option);
  }
  select.addEventListener("change", () => actions.highlight(select.value as HighlightMode));
  label.append(select);
  const mode = button(formatMessage("compare.unified", {}), toggleMode);
  mode.classList.add("compare-mode");
  const saved = button(formatMessage("compare.saved", {}), () => actions.compareSaved?.());
  saved.classList.add("compare-saved");
  const clipboard = button(
    formatMessage("compare.clipboard", {}),
    () => actions.compareClipboard?.(),
  );
  clipboard.classList.add("compare-clipboard");
  const previous = button(formatMessage("compare.previous", {}), () => actions.move(-1));
  previous.classList.add("compare-previous");
  const next = button(formatMessage("compare.next", {}), () => actions.move(1));
  next.classList.add("compare-next");
  result.append(
    label,
    saved,
    clipboard,
    previous,
    next,
    mode,
    button(formatMessage("compare.close", {}), actions.close),
  );
  return result;
}

function lineCell(
  side: CompareSide | undefined,
  row: CompareRow,
  apply: (() => void) | undefined,
): HTMLElement {
  const cell = element("div", `compare-cell compare-${row.kind}`);
  cell.dataset.changeKind = row.kind;
  if (apply) {
    const arrow = button(formatMessage("compare.apply", {}), apply);
    arrow.classList.add("compare-apply");
    arrow.dataset.testid = `compare-apply-${String(row.changeIndex)}`;
    cell.append(arrow);
  }
  if (!side) {
    cell.classList.add("compare-empty");
    return cell;
  }
  const number = element("span", "compare-line-number");
  number.textContent = String(side.lineNumber);
  const content = element("code", "compare-line-content");
  for (const span of side.spans) {
    const part = element("span", span.kind === "changed" ? "compare-changed" : "");
    part.textContent = span.text;
    content.append(part);
  }
  cell.append(number, content);
  return cell;
}

function rowSides(row: CompareRow, mode: CompareMode): readonly (CompareSide | undefined)[] {
  if (mode === "side-by-side") return [row.left, row.right];
  if (row.kind === "modified") return [row.left, row.right];
  return [row.right ?? row.left];
}

function rowElement(
  row: CompareRow,
  context: CompareRenderContext,
): HTMLElement {
  const result = element("div", "compare-row");
  if (row.changeIndex !== null) {
    result.dataset.changeIndex = String(row.changeIndex);
    result.classList.toggle("compare-selected", row.changeIndex === context.selected);
  }
  const sides = rowSides(row, context.mode);
  const changeIndex = row.changeIndex;
  const showApply = context.allowApply && changeIndex !== null &&
    !context.shownChanges.has(changeIndex);
  if (changeIndex !== null) context.shownChanges.add(changeIndex);
  for (let index = 0; index < sides.length; index += 1) {
    const apply = showApply && index === sides.length - 1 && changeIndex !== null
      ? () => context.actions.applyChange?.(changeIndex)
      : undefined;
    result.append(lineCell(sides[index], row, apply));
  }
  return result;
}

function unchangedRunEnd(rows: readonly CompareRow[], start: number): number {
  let end = start;
  while (rows[end]?.kind === "unchanged") end += 1;
  return end;
}

function appendRows(
  target: DocumentFragment,
  rows: readonly CompareRow[],
  context: CompareRenderContext,
): void {
  for (const row of rows) {
    target.append(rowElement(row, context));
  }
}

function collapsedRows(
  rows: readonly CompareRow[],
  context: CompareRenderContext,
): HTMLElement {
  const container = element("div", "compare-row compare-collapsed");
  const expand = button(formatMessage("compare.expand", { count: String(rows.length) }), () => {
    const revealed = document.createDocumentFragment();
    appendRows(revealed, rows, { ...context, shownChanges: new Set<number>() });
    container.replaceWith(revealed);
  });
  expand.classList.add("compare-expand");
  container.append(expand);
  return container;
}

function visibleRows(
  state: CompareState,
  mode: CompareMode,
  actions: CompareViewActions,
  allowApply: boolean,
): DocumentFragment {
  const result = document.createDocumentFragment();
  const context: CompareRenderContext = {
    actions,
    allowApply,
    mode,
    selected: state.selectedChange,
    shownChanges: new Set<number>(),
  };
  let index = 0;
  while (index < state.rows.length) {
    if (state.rows[index]?.kind !== "unchanged") {
      result.append(rowElement(state.rows[index] as CompareRow, context));
      index += 1;
      continue;
    }
    const end = unchangedRunEnd(state.rows, index);
    const count = end - index;
    if (count <= CONTEXT_LINE_COUNT * 2 + 1) {
      appendRows(result, state.rows.slice(index, end), context);
      index = end;
      continue;
    }
    appendRows(result, state.rows.slice(index, index + CONTEXT_LINE_COUNT), context);
    const hidden = state.rows.slice(index + CONTEXT_LINE_COUNT, end - CONTEXT_LINE_COUNT);
    result.append(collapsedRows(hidden, context));
    appendRows(result, state.rows.slice(end - CONTEXT_LINE_COUNT, end), context);
    index = end;
  }
  return result;
}

export class CompareView {
  readonly root = element("section", "compare-view");
  private readonly heading = element("div", "compare-headings");
  private readonly notice = element("p", "compare-limit-notice");
  private readonly rows = element("div", "compare-rows");
  private readonly overview = element("div", "compare-overview");
  private mode: CompareMode = "side-by-side";
  private allowApply = true;
  private names: readonly [string, string] = ["", ""];
  private state: CompareState | null = null;

  constructor(private readonly actions: CompareViewActions) {
    this.root.dataset.testid = "compare-view";
    this.root.setAttribute("aria-label", formatMessage("compare.view", {}));
    this.root.hidden = true;
    this.notice.setAttribute("role", "status");
    this.notice.textContent = formatMessage("compare.limited", {});
    this.notice.hidden = true;
    this.root.append(
      toolbar(actions, () => this.toggleMode()),
      this.notice,
      this.heading,
      this.rows,
      this.overview,
    );
  }

  show(
    leftName: string,
    rightName: string,
    state: CompareState,
    allowApply = true,
  ): void {
    this.root.hidden = false;
    this.mode = "side-by-side";
    this.names = [leftName, rightName];
    this.allowApply = allowApply;
    this.root.classList.remove("compare-unified");
    const highlight = this.root.querySelector<HTMLSelectElement>(".compare-highlight");
    if (highlight) highlight.value = state.highlight;
    this.render(state);
  }

  hide(): void {
    this.root.hidden = true;
    this.rows.replaceChildren();
    this.overview.replaceChildren();
  }

  render(state: CompareState): void {
    this.state = state;
    this.notice.hidden = !state.limited;
    this.root.classList.toggle("compare-limited", state.limited);
    this.renderHeadings();
    this.rows.replaceChildren(visibleRows(
      state,
      this.mode,
      this.actions,
      this.allowApply,
    ));
    const markers = document.createDocumentFragment();
    for (let index = 0; index < state.changeCount; index += 1) {
      const marker = element("span", "compare-overview-marker");
      marker.dataset.changeIndex = String(index);
      marker.title = formatMessage("compare.difference", { number: String(index + 1) });
      markers.append(marker);
    }
    this.overview.replaceChildren(markers);
  }

  private toggleMode(): void {
    if (!this.state) return;
    this.mode = this.mode === "side-by-side" ? "unified" : "side-by-side";
    this.root.classList.toggle("compare-unified", this.mode === "unified");
    const modeButton = this.root.querySelector<HTMLButtonElement>(".compare-mode");
    if (modeButton) {
      modeButton.textContent = formatMessage(
        this.mode === "unified" ? "compare.sideBySide" : "compare.unified",
        {},
      );
    }
    this.renderHeadings();
    this.rows.replaceChildren(visibleRows(
      this.state,
      this.mode,
      this.actions,
      this.allowApply,
    ));
  }

  private renderHeadings(): void {
    if (this.mode === "unified") {
      this.heading.replaceChildren(this.headingCell(
        `${this.names[0]} ↔ ${this.names[1]}`,
        "compare-unified-heading",
      ));
      return;
    }
    this.heading.replaceChildren(
      this.headingCell(this.names[0], "compare-left-heading"),
      this.headingCell(this.names[1], "compare-right-heading"),
    );
  }

  reveal(changeIndex: number): void {
    this.rows.querySelector<HTMLElement>(`[data-change-index="${changeIndex}"]`)
      ?.scrollIntoView({ block: "center" });
  }

  moveSelection(previous: number, selected: number): void {
    for (const row of this.changeRows(previous)) {
      row.classList.remove("compare-selected");
    }
    for (const row of this.changeRows(selected)) {
      row.classList.add("compare-selected");
    }
    this.reveal(selected);
  }

  private changeRows(changeIndex: number): NodeListOf<HTMLElement> {
    return this.rows.querySelectorAll(`[data-change-index="${changeIndex}"]`);
  }

  private headingCell(name: string, testId: string): HTMLElement {
    const heading = element("strong", "compare-heading");
    heading.dataset.testid = testId;
    heading.textContent = name;
    return heading;
  }
}
