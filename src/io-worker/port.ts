import {
  ioMessageOperation,
  ioRequestId,
  isIoOneWayMessage,
  isIoRequest,
  type IoReply,
  type IoOneWayMessage,
  type IoRequest,
  type ReadDocumentResponse,
  type SaveDocumentResponse,
} from "../shared/ipc/io";
import {
  serviceError,
  toServiceError,
  type Result,
} from "../shared/ipc/result";
import type { IoFileService } from "./services/file";

export interface IoWorkerPort {
  on(event: "message", listener: (event: { data: unknown }) => void): this;
  postMessage(message: unknown): void;
  start(): void;
  close?(): void;
}

async function runRequest(
  request: IoRequest,
  windowId: number,
  service: IoFileService,
): Promise<Result<ReadDocumentResponse | SaveDocumentResponse | Record<string, never>>> {
  try {
    if (request.op === "read") {
      return { ok: true, value: await service.read(windowId, request.grant) };
    }
    if (request.op === "attach") {
      service.attach(windowId, request);
      return { ok: true, value: {} };
    }
    return { ok: true, value: await service.save(windowId, request) };
  } catch (error) {
    return { ok: false, error: toServiceError(error) };
  }
}

function runOneWay(
  message: IoOneWayMessage,
  windowId: number,
  service: IoFileService,
): void {
  if (message.op === "change") {
    service.change(windowId, message);
  } else {
    service.detach(windowId, message.docId);
  }
}

function badRequest(id: string): IoReply {
  return {
    id,
    result: {
      ok: false,
      error: serviceError("BAD_REQUEST", "request.invalid"),
    },
  };
}

export function attachIoPort(
  port: IoWorkerPort,
  windowId: number,
  service: IoFileService,
): void {
  port.on("message", (event) => {
    const id = ioRequestId(event.data);
    if (isIoOneWayMessage(event.data)) {
      runOneWay(event.data, windowId, service);
      return;
    }
    if (!isIoRequest(event.data)) {
      const operation = ioMessageOperation(event.data);
      if (id && operation !== "change" && operation !== "detach") {
        port.postMessage(badRequest(id));
      }
      return;
    }
    const request = event.data;
    void runRequest(request, windowId, service).then((result) => {
      port.postMessage({ id: request.id, result } satisfies IoReply);
    });
  });
  port.start();
}

export class IoPortRegistry {
  private readonly ports = new Map<number, IoWorkerPort>();

  constructor(private readonly service: IoFileService) {}

  attach(windowId: number, port: IoWorkerPort): void {
    this.ports.get(windowId)?.close?.();
    this.service.revokeWindow(windowId);
    this.ports.set(windowId, port);
    attachIoPort(port, windowId, this.service);
  }

  revokeWindow(windowId: number): void {
    this.ports.get(windowId)?.close?.();
    this.ports.delete(windowId);
    this.service.revokeWindow(windowId);
  }
}
