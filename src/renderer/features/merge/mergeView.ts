import type { ChunkChoice, ChunkKind } from "../../../shared/merge/mergeChunks";
import {
  mergeCounts,
  nextChunk,
  previousChunk,
} from "../../../shared/merge/mergeChunks";
import { formatMessage } from "../../core/messages";
import type {
  MergeEditorState,
  MergeTransactionSpec,
} from "../../editor/editor";
import {
  applyMarkerChanges,
  createMarkerMergeState,
  markerMergeState,
  resolveMarkerConflict,
  type MarkerMergeState,
} from "./markerMergeState";

export interface MergeEditor {
  readonly state: MergeEditorState;
  dispatch(spec: MergeTransactionSpec): void;
}

export interface MergeViewOptions {
  readonly editorHost: HTMLElement;
  readonly editor: MergeEditor;
  readonly parse?: typeof createMarkerMergeState;
  readonly preview: HTMLElement;
  readonly workspace: HTMLElement;
}

interface MergeSession {
  readonly hasMarkers: boolean;
  readonly shell: MergeShell | null;
}

interface MergeShell {
  readonly buttons: HTMLButtonElement[][];
  readonly root: HTMLElement;
  readonly counter: HTMLElement;
  readonly counts: HTMLElement;
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
  private readonly parse: typeof createMarkerMergeState;
  private readonly keydownListener = (event: KeyboardEvent): void => this.keydown(event);
  private activeId: string | null = null;

  constructor(private readonly options: MergeViewOptions) {
    this.parse = options.parse ?? createMarkerMergeState;
  }

  install(documentId: string): void {
    const session = this.sessions.get(documentId);
    this.sessions.set(documentId, { hasMarkers: true, shell: session?.shell ?? null });
  }

  detect(
    documentId: string,
    text: string,
    install: (merge: MarkerMergeState) => void,
  ): void {
    if (this.sessions.has(documentId)) return;
    const merge = this.parse(text);
    this.sessions.set(documentId, this.emptySession(merge !== null));
    if (merge !== null) install(merge);
  }

  activate(documentId: string, state: MergeEditorState): void {
    const session = this.sessions.get(documentId);
    const merge = markerMergeState(state);
    if (session === undefined || !session.hasMarkers || merge === null) {
      this.hide();
      return;
    }
    if (this.activeId === documentId && session.shell !== null) {
      this.refresh(session.shell, merge);
      return;
    }
    this.hide();
    const shell = session.shell ?? this.build(documentId, merge);
    this.sessions.set(documentId, { ...session, shell });
    this.show(documentId, shell);
    this.refresh(shell, merge);
  }

  stateChanged(documentId: string | null, state: MergeEditorState): void {
    if (documentId === null || documentId !== this.activeId) return;
    const session = this.sessions.get(documentId);
    const merge = markerMergeState(state);
    if (session?.shell !== null && session?.shell !== undefined && merge !== null) {
      this.refresh(session.shell, merge);
    }
  }

  forget(documentId: string): void {
    if (this.activeId === documentId) this.hide();
    this.sessions.delete(documentId);
  }

  private emptySession(hasMarkers: boolean): MergeSession {
    return { hasMarkers, shell: null };
  }

  private build(documentId: string, merge: MarkerMergeState): MergeShell {
    const root = element("section", "merge-view");
    root.dataset["testid"] = "merge-view";
    const toolbar = element("div", "merge-toolbar");
    const counter = element("span", "merge-counter");
    counter.dataset["testid"] = "merge-conflicts-left";
    const counts = element("span", "merge-counter");
    counts.dataset["testid"] = "merge-counts";
    const apply = element("button", "merge-choice");
    apply.type = "button";
    apply.dataset["testid"] = "merge-apply-changes";
    apply.textContent = formatMessage("merge.applyChanges", {});
    apply.addEventListener("click", () => this.applyChanges(documentId));
    toolbar.append(counts, counter, apply);
    const buttons = merge.merge.chunks.map((item, index) =>
      item.kind === "conflict"
        ? this.conflictControls(toolbar, documentId, index)
        : []);
    root.append(toolbar, this.pane("left", merge.left));
    const centre = this.pane("result", "");
    centre.append(this.options.editorHost);
    root.append(centre, this.pane("right", merge.right));
    return { buttons, counter, counts, root };
  }

  private show(documentId: string, shell: MergeShell): void {
    const centre = shell.root.querySelector<HTMLElement>(".merge-pane-result");
    centre?.append(this.options.editorHost);
    this.options.workspace.classList.add("merge-active");
    this.options.preview.hidden = true;
    this.options.workspace.append(shell.root);
    this.activeId = documentId;
    document.addEventListener("keydown", this.keydownListener, true);
  }

  private hide(): void {
    if (this.activeId === null) return;
    const root = this.sessions.get(this.activeId)?.shell?.root;
    this.options.workspace.classList.remove("merge-active");
    this.options.preview.hidden = false;
    this.options.workspace.insertBefore(this.options.editorHost, this.options.preview);
    root?.remove();
    this.activeId = null;
    document.removeEventListener("keydown", this.keydownListener, true);
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

  private conflictControls(
    toolbar: HTMLElement,
    documentId: string,
    index: number,
  ): HTMLButtonElement[] {
    const controls = element("div", "merge-conflict-controls");
    controls.dataset["testid"] = `merge-conflict-${String(index + 1)}`;
    const label = element("span", "merge-conflict-label");
    label.textContent = formatMessage("merge.conflict", { number: String(index + 1) });
    controls.append(label);
    const buttons = (["left", "right", "both"] as const).map((choice) =>
      this.choiceButton(documentId, index, choice));
    controls.append(...buttons);
    toolbar.append(controls);
    return buttons;
  }

  private choiceButton(
    documentId: string,
    index: number,
    choice: ChunkChoice,
  ): HTMLButtonElement {
    const button = element("button", "merge-choice");
    button.type = "button";
    button.dataset["testid"] = `merge-conflict-${String(index + 1)}-${choice}`;
    button.textContent = formatMessage(`merge.accept.${choice}`, {});
    button.addEventListener("click", () => this.resolve(documentId, index, choice));
    return button;
  }

  private resolve(documentId: string, index: number, choice: ChunkChoice): void {
    if (documentId !== this.activeId) return;
    const transaction = resolveMarkerConflict(this.options.editor.state, index, choice);
    if (transaction === null) {
      this.stateChanged(documentId, this.options.editor.state);
      return;
    }
    this.options.editor.dispatch(transaction);
  }

  private applyChanges(documentId: string): void {
    if (documentId !== this.activeId) return;
    const transaction = applyMarkerChanges(this.options.editor.state);
    if (transaction !== null) this.options.editor.dispatch(transaction);
  }

  private keydown(event: KeyboardEvent): void {
    if (this.activeId === null || event.key !== "F7" || event.ctrlKey ||
      event.altKey || event.metaKey) return;
    event.preventDefault();
    this.navigate(event.shiftKey ? -1 : 1);
  }

  private navigate(direction: 1 | -1): void {
    const merge = markerMergeState(this.options.editor.state);
    if (merge === null) return;
    const offset = this.options.editor.state.selection.main.head;
    const candidates = (["change", "conflict"] as const)
      .map((kind) => this.chunkIndex(merge, offset, kind, direction))
      .filter((index): index is number => index !== null);
    const index = direction === 1 ? Math.min(...candidates) : Math.max(...candidates);
    const position = merge.merge.chunks[index]?.start;
    if (position !== undefined) {
      this.options.editor.dispatch({ selection: { anchor: position }, scrollIntoView: true });
    }
  }

  private chunkIndex(
    merge: MarkerMergeState,
    offset: number,
    kind: ChunkKind,
    direction: 1 | -1,
  ): number | null {
    return direction === 1
      ? nextChunk(merge.merge, offset, kind)
      : previousChunk(merge.merge, offset, kind);
  }

  private refresh(shell: MergeShell, merge: MarkerMergeState): void {
    const counts = mergeCounts(merge.merge);
    const count = counts.conflictsLeft;
    shell.counter.textContent = formatMessage(
      count === 1 ? "merge.conflictLeft" : "merge.conflictsLeft",
      { count: String(count) },
    );
    shell.counts.textContent = formatMessage("merge.counts", {
      changes: String(counts.changesLeft),
      conflicts: String(counts.conflictsLeft),
      changeLabel: counts.changesLeft === 1 ? "change" : "changes",
      conflictLabel: counts.conflictsLeft === 1 ? "conflict" : "conflicts",
    });
    shell.buttons.forEach((buttons, index) => {
      const disabled = merge.merge.resolved[index] === true || merge.valid[index] !== true;
      for (const button of buttons) button.disabled = disabled;
    });
  }
}
