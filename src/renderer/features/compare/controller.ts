import "./compare.css";

import type {
  CompareState,
  CompareWorkerRequest,
  CompareWorkerResponse,
  HighlightMode,
} from "../../../shared/workers/compare";
import type { DocumentRecord } from "../../core/document";
import { formatMessage } from "../../core/messages";
import { applyChangeToRight, moveDifference } from "./state";
import { CompareView } from "./view";

interface WorkerPort {
  onmessage: ((event: MessageEvent<CompareWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(request: CompareWorkerRequest): void;
  terminate(): void;
}

export interface CompareControllerOptions {
  applyRight?(text: string): void;
  documents(): readonly DocumentRecord[];
  editor: HTMLElement;
  isActive?(document: DocumentRecord): boolean;
  preview: HTMLElement;
  readClipboard?(): Promise<string>;
  showStatus(message?: string): void;
  workspace: HTMLElement;
  workerFactory?: () => WorkerPort;
  workerUrl?: URL;
}

function createWorker(options: CompareControllerOptions): WorkerPort {
  if (options.workerFactory) return options.workerFactory();
  if (!options.workerUrl) throw new Error("A compare worker URL is required.");
  return new Worker(options.workerUrl, { type: "module" });
}

export class CompareController {
  private worker: WorkerPort;
  private readonly view: CompareView;
  private requestId = 0;
  private state: CompareState | null = null;
  private pair: readonly [DocumentRecord, DocumentRecord] | null = null;
  private source: "documents" | "saved" | "clipboard" = "documents";
  private sourceText: string | null = null;
  private hiddenState: { editor: string | null; preview: string | null } | null = null;

  constructor(private readonly options: CompareControllerOptions) {
    this.worker = createWorker(options);
    this.view = new CompareView({
      applyChange: (changeIndex) => this.applyChange(changeIndex),
      close: () => this.close(),
      compareClipboard: () => { void this.compareClipboard(); },
      compareSaved: () => this.compareSaved(),
      highlight: (mode) => this.setHighlight(mode),
      move: (direction) => this.move(direction),
    });
    options.workspace.append(this.view.root);
    this.bindWorker();
    document.addEventListener("keydown", (event) => this.keydown(event), true);
  }

  open(): void {
    const documents = this.options.documents();
    if (documents.length < 2) {
      this.options.showStatus(formatMessage("compare.needTwo", {}));
      return;
    }
    const active = documents.find((document) => this.options.isActive?.(document)) ??
      documents[documents.length - 1] as DocumentRecord;
    const other = [...documents].reverse().find((document) => document !== active);
    if (!other) return;
    this.pair = [other, active];
    this.source = "documents";
    this.sourceText = null;
    this.hiddenState ??= {
      editor: this.options.editor.getAttribute("hidden"),
      preview: this.options.preview.getAttribute("hidden"),
    };
    this.options.editor.hidden = true;
    this.options.preview.hidden = true;
    this.options.workspace.classList.add("compare-open");
    this.request("words");
  }

  close(): void {
    this.requestId += 1;
    this.pair = null;
    this.state = null;
    this.view.hide();
    this.restoreHiddenState();
    this.options.workspace.classList.remove("compare-open");
  }

  private request(highlight: HighlightMode): void {
    if (!this.pair) return;
    const request = this.requestContent();
    this.requestId += 1;
    this.worker.postMessage({
      id: this.requestId,
      left: request.left,
      right: request.right,
      highlight,
    });
  }

  private receive(response: CompareWorkerResponse): void {
    if (response.id !== this.requestId || !this.pair) return;
    if (!response.ok) {
      this.fail(response.message);
      return;
    }
    this.state = response.state;
    const request = this.requestContent();
    this.view.show(
      request.leftName,
      request.rightName,
      response.state,
      this.source === "documents",
    );
    this.view.reveal(response.state.selectedChange);
  }

  private setHighlight(highlight: HighlightMode): void {
    this.request(highlight);
  }

  private compareSaved(): void {
    if (!this.pair) return;
    this.source = "saved";
    this.sourceText = this.pair[1].saved.text.toString();
    this.request(this.state?.highlight ?? "words");
  }

  private async compareClipboard(): Promise<void> {
    if (!this.pair) return;
    try {
      const read = this.options.readClipboard ?? (() => navigator.clipboard.readText());
      this.sourceText = await read();
      this.source = "clipboard";
      this.request(this.state?.highlight ?? "words");
    } catch {
      this.options.showStatus(formatMessage("compare.clipboardFailed", {}));
    }
  }

  private applyChange(changeIndex: number): void {
    if (!this.state || this.source !== "documents" || !this.pair) return;
    const right = applyChangeToRight(this.state, changeIndex);
    this.options.applyRight?.(right);
    this.sourceText = right;
    this.request(this.state.highlight);
    this.sourceText = null;
  }

  private requestContent(): {
    left: string;
    leftName: string;
    right: string;
    rightName: string;
  } {
    if (!this.pair) throw new Error("A compare pair is required.");
    const [left, right] = this.pair;
    const leftName = left.name ?? "Untitled";
    const rightName = right.name ?? "Untitled";
    if (this.source === "documents") {
      return {
        left: left.state.doc.toString(),
        leftName,
        right: this.sourceText ?? right.state.doc.toString(),
        rightName,
      };
    }
    return {
      left: right.state.doc.toString(),
      leftName: `${rightName} (current)`,
      right: this.sourceText ?? "",
      rightName: this.source === "saved" ? `${rightName} (saved)` : "Clipboard",
    };
  }

  private move(direction: 1 | -1): void {
    if (!this.state) return;
    const previous = this.state.selectedChange;
    this.state = moveDifference(this.state, direction);
    this.view.moveSelection(previous, this.state.selectedChange);
  }

  private keydown(event: KeyboardEvent): void {
    if (!this.pair || event.key !== "F7" || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    this.move(event.shiftKey ? -1 : 1);
  }

  private bindWorker(): void {
    this.worker.onmessage = (event) => this.receive(event.data);
    this.worker.onerror = () => this.fail(formatMessage("compare.workerFailed", {}));
  }

  private fail(message: string): void {
    this.close();
    this.options.showStatus(message);
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
    this.worker = createWorker(this.options);
    this.bindWorker();
  }

  private restoreHiddenState(): void {
    if (!this.hiddenState) return;
    this.restoreHidden(this.options.editor, this.hiddenState.editor);
    this.restoreHidden(this.options.preview, this.hiddenState.preview);
    this.hiddenState = null;
  }

  private restoreHidden(element: HTMLElement, value: string | null): void {
    if (value === null) element.removeAttribute("hidden");
    else element.setAttribute("hidden", value);
  }
}
