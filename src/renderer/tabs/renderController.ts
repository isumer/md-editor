import type { DocumentRecord } from "../core/document";
import type { ReplicatedVersion } from "../core/replication";
import { WorkerHeartbeat } from "../core/heartbeat";
import type { ChangeDocumentMessage } from "../../shared/ipc/io";
import type {
  RenderAttachMessage,
  RenderPongMessage,
  RenderResponse,
  RenderResync,
} from "../../shared/workers/render";
import {
  type PreviewDocuments,
  wireRenderWorker,
} from "../features/preview/preview";
import { RenderScheduler } from "../features/preview/renderScheduler";

interface RenderWorkerPort {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<RenderResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate(): void;
}

interface RenderHandlers {
  onmessage: ((event: MessageEvent<RenderResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export interface RenderControllerOptions {
  current(): DocumentRecord | null;
  preview: HTMLElement;
  restartMessage: string;
  rewriteHtml(html: string): string;
  showError(message?: string): void;
  showStatus(message?: string): void;
  workerUrl: URL;
}

export function isRenderPong(response: RenderResponse): response is RenderPongMessage {
  return "op" in response && response.op === "pong";
}

export class RenderController {
  private worker: RenderWorkerPort;
  private readonly handlers: RenderHandlers = { onmessage: null, onerror: null };
  private previews: PreviewDocuments | null = null;
  private readonly scheduler: RenderScheduler;
  private readonly heartbeat: WorkerHeartbeat;
  private readonly proxy;

  constructor(private readonly options: RenderControllerOptions) {
    this.worker = this.createWorker();
    this.proxy = this.createProxy();
    this.scheduler = new RenderScheduler((request) => this.render(request.id), {
      dispatchImmediately: true,
      onApplied: (latency) => {
        const end = performance.now();
        performance.measure("preview-latency", { start: end - latency, end });
      },
    });
    this.heartbeat = new WorkerHeartbeat({
      onPing: (id) => this.ping(id),
      onStuck: () => this.restart(),
    });
  }

  start(): void {
    this.installHandlers();
    this.previews = wireRenderWorker(this.proxy, {
      scheduler: this.scheduler,
      preview: this.options.preview,
      showStatus: this.options.showStatus,
      showError: this.options.showError,
      currentVersion: () => this.options.current()?.replication.current() ?? {
        docId: "document-none",
        epoch: 0,
        version: 0,
      },
      onResync: (response) => this.resync(response),
      rewriteHtml: this.options.rewriteHtml,
    });
    this.heartbeat.start();
    this.scheduler.schedule();
  }

  attach(document: DocumentRecord, text = document.state.doc.toString()): void {
    this.attachVersion(document.replication.current(), text);
  }

  attachVersion(version: ReplicatedVersion, text: string): void {
    this.worker.postMessage({
      op: "attach",
      ...version,
      text,
    } satisfies RenderAttachMessage);
  }

  change(message: ChangeDocumentMessage): void {
    this.worker.postMessage(message);
  }

  detach(docId: string): void {
    this.worker.postMessage({ op: "detach", docId });
    this.previews?.drop(docId);
  }

  activate(document: DocumentRecord): void {
    if (this.previews?.show(document.replication.current()) !== true) {
      this.scheduler.schedule();
    }
  }

  schedule(): void {
    performance.mark("preview-scheduled");
    this.scheduler.schedule();
  }

  private createWorker(): RenderWorkerPort {
    return new Worker(this.options.workerUrl, { type: "module" });
  }

  private createProxy() {
    const controller = this;
    return {
      postMessage: (message: unknown) => this.worker.postMessage(message),
      get onmessage() {
        return controller.handlers.onmessage;
      },
      set onmessage(handler: ((event: MessageEvent<RenderResponse>) => void) | null) {
        controller.handlers.onmessage = handler;
      },
      get onerror() {
        return controller.handlers.onerror;
      },
      set onerror(handler: ((event: ErrorEvent) => void) | null) {
        controller.handlers.onerror = handler;
      },
    };
  }

  private installHandlers(): void {
    this.worker.onmessage = (event) => {
      if (isRenderPong(event.data)) {
        this.heartbeat.pong(event.data.id);
        return;
      }
      performance.mark("preview-response");
      this.handlers.onmessage?.(event);
    };
    this.worker.onerror = (event) => this.handlers.onerror?.(event);
  }

  private render(id: number): void {
    const document = this.options.current();
    if (document) {
      performance.mark("preview-dispatch");
      this.worker.postMessage({ op: "render", id, ...document.replication.current() });
    } else {
      this.scheduler.discardResult(id);
    }
  }

  private ping(id: number): void {
    try {
      this.worker.postMessage({ op: "ping", id });
    } catch {
      this.restart();
    }
  }

  private restart(): void {
    try {
      this.worker.terminate();
    } catch {
      // A worker that already exited needs no termination.
    }
    this.worker = this.createWorker();
    this.installHandlers();
    this.scheduler.dispose();
    this.previews?.reset();
    this.options.showError(this.options.restartMessage);
    const document = this.options.current();
    if (document) {
      this.attach(document);
      this.scheduler.schedule();
    }
    this.heartbeat.stop();
    this.heartbeat.start();
  }

  private resync(response: RenderResync): void {
    const document = this.options.current();
    const current = document?.replication.current();
    if (!document || !current || response.docId !== current.docId ||
      response.epoch !== current.epoch || response.version > current.version) {
      return;
    }
    this.attach(document);
    this.scheduler.schedule();
  }
}
