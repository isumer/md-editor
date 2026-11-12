import {
  ioMessageOperation,
  ioRequestId,
  isIoOneWayMessage,
  isIoRequest,
  type IoReply,
  type IoOneWayMessage,
  type IoRequest,
  type ListDraftsResponse,
  type ReadDocumentResponse,
  type SaveDocumentResponse,
} from "../shared/ipc/io";
import type { WorkspaceChangeMessage } from "../shared/ipc/workspace";
import {
  isWorkspaceIoRequest,
  type WorkspaceIoReply,
  type WorkspaceIoRequest,
  type WorkspaceIoResponse,
} from "../shared/ipc/workspaceIo";
import {
  serviceError,
  toServiceError,
  type Result,
} from "../shared/ipc/result";
import type { IoFileService } from "./services/file";
import type { IoWorkspaceService } from "./services/workspace";

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
): Promise<Result<
  ReadDocumentResponse | SaveDocumentResponse | ListDraftsResponse |
  Record<string, never>
>> {
  try {
    if (request.op === "read") {
      return { ok: true, value: await service.read(windowId, request.grant) };
    }
    if (request.op === "attach") {
      service.attach(windowId, request);
      return { ok: true, value: {} };
    }
    if (request.op === "draft") {
      service.draft(windowId, request);
      return { ok: true, value: {} };
    }
    if (request.op === "drafts") {
      return { ok: true, value: service.listDrafts(windowId) };
    }
    return { ok: true, value: await service.save(windowId, request) };
  } catch (error) {
    return { ok: false, error: toServiceError(error) };
  }
}

async function runWorkspaceRequest(
  request: WorkspaceIoRequest,
  windowId: number,
  service: IoWorkspaceService,
): Promise<Result<WorkspaceIoResponse>> {
  try {
    if (request.op === "workspaceList") {
      return { ok: true, value: await service.listChildren(windowId, request.grant, request.path) };
    }
    if (request.op === "workspaceCreate") {
      await service.createFile(windowId, request.grant, request.path);
    } else if (request.op === "workspaceDelete") {
      await service.deleteFile(windowId, request.grant, request.path);
    } else {
      await service.renameFile(windowId, request.grant, request.path, request.newPath);
    }
    return { ok: true, value: {} };
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
  } else if (message.op === "clear-draft") {
    service.clearDraft(windowId, message.docId);
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
  workspaces?: IoWorkspaceService,
): void {
  port.on("message", (event) => {
    const id = ioRequestId(event.data);
    if (isIoOneWayMessage(event.data)) {
      runOneWay(event.data, windowId, service);
      return;
    }
    if (isWorkspaceIoRequest(event.data)) {
      const request = event.data;
      if (!workspaces) {
        port.postMessage(badRequest(request.id));
        return;
      }
      void runWorkspaceRequest(request, windowId, workspaces).then((result) => {
        port.postMessage({ id: request.id, result } satisfies WorkspaceIoReply);
      });
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

  constructor(
    private readonly service: IoFileService,
    private readonly workspaces: IoWorkspaceService,
  ) {
    workspaces.setChangeSink((windowId, change) => this.sendWorkspaceChange(windowId, change));
  }

  attach(windowId: number, port: IoWorkerPort): void {
    this.ports.get(windowId)?.close?.();
    // A reattach (renderer reload after a crash) keeps drafts for recovery.
    this.service.resetWindow(windowId);
    this.ports.set(windowId, port);
    attachIoPort(port, windowId, this.service, this.workspaces);
  }

  revokeWindow(windowId: number): void {
    this.ports.get(windowId)?.close?.();
    this.ports.delete(windowId);
    this.service.revokeWindow(windowId);
  }

  private sendWorkspaceChange(windowId: number, change: WorkspaceChangeMessage): void {
    this.ports.get(windowId)?.postMessage({ op: "workspaceChange", change });
  }
}
