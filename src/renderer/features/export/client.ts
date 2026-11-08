import type { HtmlExportInput } from "./html";

interface ExportWorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown): void;
}

interface PendingExport {
  resolve(html: string): void;
  reject(error: Error): void;
}

function response(value: unknown): { id: number; html?: string; message?: string } | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const data = value as Record<string, unknown>;
  if (!Number.isSafeInteger(data["id"]) || typeof data["ok"] !== "boolean") {
    return null;
  }
  if (data["ok"] === true && typeof data["html"] === "string") {
    return { id: data["id"] as number, html: data["html"] };
  }
  if (data["ok"] === false && typeof data["message"] === "string") {
    return { id: data["id"] as number, message: data["message"] };
  }
  return null;
}

export class HtmlExportClient {
  private readonly pending = new Map<number, PendingExport>();
  private nextId = 1;

  constructor(private readonly worker: ExportWorkerPort) {
    worker.onmessage = (event) => this.receive(event.data);
    worker.onerror = (event) => this.failAll(event.message);
  }

  build(input: HtmlExportInput): Promise<string> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, input });
    });
  }

  private receive(value: unknown): void {
    const reply = response(value);
    const pending = reply ? this.pending.get(reply.id) : undefined;
    if (!reply || !pending) {
      return;
    }
    this.pending.delete(reply.id);
    if (reply.html !== undefined) {
      pending.resolve(reply.html);
    } else {
      pending.reject(new Error(reply.message ?? "HTML export failed"));
    }
  }

  private failAll(message: string): void {
    for (const pending of this.pending.values()) {
      pending.reject(new Error(message || "HTML export worker failed"));
    }
    this.pending.clear();
  }
}
