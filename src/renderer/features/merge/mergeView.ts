import type { ChunkChoice } from "../../../shared/merge/mergeChunks";
import { mergeCounts } from "../../../shared/merge/mergeChunks";
import { formatMessage } from "../../../shared/messages/en";
import {
  createMarkerMergeState,
  resolveMarkerConflict,
  undoMarkerConflict,
  type MarkerMergeState,
} from "./markerMergeState";
import "./merge.css";

export interface MergeEditor {
  replaceText(text: string): void;
}

export interface MergeViewOptions {
  readonly editorHost: HTMLElement;
  readonly editor: MergeEditor;
  readonly preview: HTMLElement;
  readonly workspace: HTMLElement;
}

interface MergeSession {
  state: MarkerMergeState;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.className = className;
  return result;
}

export class MergeView {
  private readonly sessions = new Map<string, MergeSession>();
  private activeId: string | null = null;
  private root: HTMLElement | null = null;

  constructor(private readonly options: MergeViewOptions) {}

  activate(documentId: string, text: string): void {
    this.hide();
    let session = this.sessions.get(documentId);
    if (session === undefined) {
      const state = createMarkerMergeState(text);
      if (state === null) return;
      session = { state };
      this.sessions.set(documentId, session);
      this.options.editor.replaceText(state.text);
    }
    this.activeId = documentId;
    this.show(session);
  }

  forget(documentId: string): void {
    this.sessions.delete(documentId);
    if (this.activeId === documentId) this.hide();
  }

  private show(session: MergeSession): void {
    const root = element("section", "merge-view");
    root.dataset["testid"] = "merge-view";
    const toolbar = this.toolbar(session);
    root.append(toolbar, this.pane("left", session.state.left));
    const centre = this.pane("result", "");
    centre.append(this.options.editorHost);
    root.append(centre, this.pane("right", session.state.right));
    this.options.workspace.classList.add("merge-active");
    this.options.preview.hidden = true;
    this.options.workspace.append(root);
    this.root = root;
  }

  private hide(): void {
    if (this.root === null) return;
    this.options.workspace.classList.remove("merge-active");
    this.options.preview.hidden = false;
    this.options.workspace.insertBefore(this.options.editorHost, this.options.preview);
    this.root.remove();
    this.root = null;
    this.activeId = null;
  }

  private pane(name: "left" | "result" | "right", text: string): HTMLElement {
    const pane = element("section", `merge-pane merge-pane-${name}`);
    pane.setAttribute("aria-label", formatMessage(`merge.${name}`, {}));
    pane.dataset["testid"] = `merge-${name}`;
    const heading = element("h2", "merge-pane-title");
    heading.textContent = formatMessage(`merge.${name}`, {});
    pane.append(heading);
    if (name !== "result") {
      const content = element("pre", "merge-side-content");
      content.textContent = text;
      pane.append(content);
    }
    return pane;
  }

  private toolbar(session: MergeSession): HTMLElement {
    const toolbar = element("div", "merge-toolbar");
    toolbar.append(this.counter(session));
    session.state.merge.chunks.forEach((_chunk, index) => {
      toolbar.append(this.conflictControls(session, index));
    });
    const undo = element("button", "merge-undo");
    undo.type = "button";
    undo.textContent = formatMessage("merge.undo", {});
    undo.disabled = session.state.history.length === 0;
    undo.addEventListener("click", () => this.undo(session));
    toolbar.append(undo);
    return toolbar;
  }

  private counter(session: MergeSession): HTMLElement {
    const count = mergeCounts(session.state.merge).conflictsLeft;
    const counter = element("span", "merge-counter");
    counter.dataset["testid"] = "merge-conflicts-left";
    counter.textContent = formatMessage(
      count === 1 ? "merge.conflictLeft" : "merge.conflictsLeft",
      { count: String(count) },
    );
    return counter;
  }

  private conflictControls(session: MergeSession, index: number): HTMLElement {
    const controls = element("div", "merge-conflict-controls");
    controls.dataset["testid"] = `merge-conflict-${String(index + 1)}`;
    const label = element("span", "merge-conflict-label");
    label.textContent = formatMessage("merge.conflict", { number: String(index + 1) });
    controls.append(label);
    for (const choice of ["left", "right", "both"] as const) {
      controls.append(this.choiceButton(session, index, choice));
    }
    return controls;
  }

  private choiceButton(
    session: MergeSession,
    index: number,
    choice: ChunkChoice,
  ): HTMLButtonElement {
    const button = element("button", "merge-choice");
    button.type = "button";
    button.dataset["testid"] = `merge-conflict-${String(index + 1)}-${choice}`;
    button.textContent = formatMessage(`merge.accept.${choice}`, {});
    button.disabled = session.state.merge.resolved[index] ?? true;
    button.addEventListener("click", () => this.resolve(session, index, choice));
    return button;
  }

  private resolve(session: MergeSession, index: number, choice: ChunkChoice): void {
    session.state = resolveMarkerConflict(session.state, index, choice);
    this.options.editor.replaceText(session.state.text);
    this.rerender(session);
  }

  private undo(session: MergeSession): void {
    session.state = undoMarkerConflict(session.state);
    this.options.editor.replaceText(session.state.text);
    this.rerender(session);
  }

  private rerender(session: MergeSession): void {
    this.hide();
    this.activeId = [...this.sessions].find(([, value]) => value === session)?.[0] ?? null;
    this.show(session);
  }
}
