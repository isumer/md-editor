import {
  ioRequestId,
  isIoRequest,
  type IoReply,
  type IoRequest,
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
): Promise<Result<{ name: string; text: string } | { name: string }>> {
  try {
    const value = request.op === "read"
      ? await service.read(windowId, request.grant)
      : await service.write(windowId, request.grant, request.text);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: toServiceError(error) };
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
    if (!isIoRequest(event.data)) {
      if (id) {
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
    this.ports.set(windowId, port);
    attachIoPort(port, windowId, this.service);
  }

  revokeWindow(windowId: number): void {
    this.ports.get(windowId)?.close?.();
    this.ports.delete(windowId);
  }
}
