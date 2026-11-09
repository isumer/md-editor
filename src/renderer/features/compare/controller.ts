import { formatMessage } from "../../../shared/messages/en";
import type { DocumentRecord } from "../../core/document";
import { moveDifference, type CompareState, type HighlightMode } from "./state";
import { CompareView } from "./view";
import type { CompareWorkerRequest, CompareWorkerResponse } from "./worker";

interface WorkerPort {
  onmessage: ((event: MessageEvent<CompareWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(request: CompareWorkerRequest): void;
}

export interface CompareControllerOptions {
  documents(): readonly DocumentRecord[];
  editor: HTMLElement;
  preview: HTMLElement;
  showStatus(message?: string): void;
  workspace: HTMLElement;
  worker?: WorkerPort;
  workerUrl?: URL;
}

function createWorker(options: CompareControllerOptions): WorkerPort {
  if (options.worker) return options.worker;
  if (!options.workerUrl) throw new Error("A compare worker URL is required.");
  return new Worker(options.workerUrl, { type: "module" });
}

export class CompareController {
  private readonly worker: WorkerPort;
  private readonly view: CompareView;
  private requestId = 0;
  private state: CompareState | null = null;
  private pair: readonly [DocumentRecord, DocumentRecord] | null = null;

  constructor(private readonly options: CompareControllerOptions) {
    this.worker = createWorker(options);
    this.view = new CompareView({
      close: () => this.close(),
      highlight: (mode) => this.setHighlight(mode),
      move: (direction) => this.move(direction),
    });
    options.workspace.append(this.view.root);
    this.worker.onmessage = (event) => this.receive(event.data);
    this.worker.onerror = () => this.options.showStatus(
      formatMessage("compare.workerFailed", {}),
    );
    document.addEventListener("keydown", (event) => this.keydown(event), true);
  }

  open(): void {
    const documents = this.options.documents();
    if (documents.length < 2) {
      this.options.showStatus(formatMessage("compare.needTwo", {}));
      return;
    }
    this.pair = [documents[documents.length - 2] as DocumentRecord,
      documents[documents.length - 1] as DocumentRecord];
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
    this.options.editor.hidden = false;
    this.options.preview.hidden = false;
    this.options.workspace.classList.remove("compare-open");
  }

  private request(highlight: HighlightMode): void {
    if (!this.pair) return;
    const [left, right] = this.pair;
    this.requestId += 1;
    this.worker.postMessage({
      id: this.requestId,
      left: left.state.doc.toString(),
      right: right.state.doc.toString(),
      highlight,
    });
  }

  private receive(response: CompareWorkerResponse): void {
    if (response.id !== this.requestId || !this.pair) return;
    if (!response.ok) {
      this.options.showStatus(response.message);
      return;
    }
    this.state = response.state;
    this.view.show(
      this.pair[0].name ?? "Untitled",
      this.pair[1].name ?? "Untitled",
      response.state,
    );
    this.view.reveal(response.state.selectedChange);
  }

  private setHighlight(highlight: HighlightMode): void {
    this.request(highlight);
  }

  private move(direction: 1 | -1): void {
    if (!this.state) return;
    this.state = moveDifference(this.state, direction);
    this.view.render(this.state);
    this.view.reveal(this.state.selectedChange);
  }

  private keydown(event: KeyboardEvent): void {
    if (event.key.toLowerCase() === "c" && event.altKey &&
      (event.ctrlKey || event.metaKey) && !event.shiftKey) {
      event.preventDefault();
      this.open();
      return;
    }
    if (!this.pair || event.key !== "F7" || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    this.move(event.shiftKey ? -1 : 1);
  }
}
