import { formatMessage } from "../../../shared/messages/en";
import type {
  CompareRow,
  CompareSide,
  CompareState,
  HighlightMode,
} from "../../../shared/workers/compare";

export interface CompareViewActions {
  close(): void;
  highlight(mode: HighlightMode): void;
  move(direction: 1 | -1): void;
}

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

function toolbar(actions: CompareViewActions): HTMLElement {
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
  result.append(
    label,
    button(formatMessage("compare.previous", {}), () => actions.move(-1)),
    button(formatMessage("compare.next", {}), () => actions.move(1)),
    button(formatMessage("compare.close", {}), actions.close),
  );
  return result;
}

function lineCell(side: CompareSide | undefined, row: CompareRow): HTMLElement {
  const cell = element("div", `compare-cell compare-${row.kind}`);
  cell.dataset.changeKind = row.kind;
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

function rowElement(row: CompareRow, selected: number): HTMLElement {
  const result = element("div", "compare-row");
  if (row.changeIndex !== null) {
    result.dataset.changeIndex = String(row.changeIndex);
    result.classList.toggle("compare-selected", row.changeIndex === selected);
  }
  result.append(lineCell(row.left, row), lineCell(row.right, row));
  return result;
}

export class CompareView {
  readonly root = element("section", "compare-view");
  private readonly heading = element("div", "compare-headings");
  private readonly rows = element("div", "compare-rows");
  private readonly overview = element("div", "compare-overview");

  constructor(actions: CompareViewActions) {
    this.root.dataset.testid = "compare-view";
    this.root.setAttribute("aria-label", formatMessage("compare.view", {}));
    this.root.hidden = true;
    this.root.append(toolbar(actions), this.heading, this.rows, this.overview);
  }

  show(leftName: string, rightName: string, state: CompareState): void {
    this.root.hidden = false;
    this.heading.replaceChildren(
      this.headingCell(leftName, "compare-left-heading"),
      this.headingCell(rightName, "compare-right-heading"),
    );
    this.render(state);
  }

  hide(): void {
    this.root.hidden = true;
    this.rows.replaceChildren();
    this.overview.replaceChildren();
  }

  render(state: CompareState): void {
    const rows = document.createDocumentFragment();
    for (const row of state.rows) rows.append(rowElement(row, state.selectedChange));
    this.rows.replaceChildren(rows);
    const markers = document.createDocumentFragment();
    for (let index = 0; index < state.changeCount; index += 1) {
      const marker = element("span", "compare-overview-marker");
      marker.dataset.changeIndex = String(index);
      marker.title = formatMessage("compare.difference", { number: String(index + 1) });
      markers.append(marker);
    }
    this.overview.replaceChildren(markers);
  }

  reveal(changeIndex: number): void {
    this.rows.querySelector<HTMLElement>(`[data-change-index="${changeIndex}"]`)
      ?.scrollIntoView({ block: "center" });
  }

  private headingCell(name: string, testId: string): HTMLElement {
    const heading = element("strong", "compare-heading");
    heading.dataset.testid = testId;
    heading.textContent = name;
    return heading;
  }
}
