import { contextBridge, ipcRenderer } from "electron";

import type {
  ChooseSaveTargetRequest,
  DocumentReference,
  FILE_CHANNELS as SharedFileChannels,
  OpenRequestReady,
  ReleaseDocumentRequest,
} from "../shared/ipc/file";
import type {
  IO_PORT_CHANNEL as SharedIoPortChannel,
  ReadDocumentResponse,
  WriteDocumentResponse,
} from "../shared/ipc/io";
import type { LINK_CHANNELS as SharedLinkChannels } from "../shared/ipc/link";
import type {
  MENU_CHANNELS as SharedMenuChannels,
  MenuCommand,
} from "../shared/ipc/menu";
import type { Result } from "../shared/ipc/result";

// A sandboxed preload cannot require our modules, so channels are copied; satisfies keeps them in step.
const FILE_CHANNELS = {
  openFile: "file:open",
  chooseSaveTarget: "file:choose-save-target",
  releaseDocument: "file:release-document",
  openRequestsReady: "file:open-requests-ready",
  openRequest: "file:open-request",
} as const satisfies typeof SharedFileChannels;
const IO_PORT_CHANNEL = "io:port" as const satisfies typeof SharedIoPortChannel;
const LINK_CHANNELS = {
  openExternal: "link:open-external",
} as const satisfies typeof SharedLinkChannels;
const MENU_CHANNELS = {
  command: "menu:command",
} as const satisfies typeof SharedMenuChannels;

interface RendererPort {
  onmessage: ((event: { data: unknown }) => void) | null;
  close(): void;
  postMessage(message: unknown): void;
  start(): void;
}

type PortOperation =
  | { op: "read"; grant: string }
  | { op: "write"; grant: string; text: string };

interface PendingRequest {
  operation: PortOperation;
  resolve(result: Result<unknown>): void;
}

function workerRestarted(): Result<never> {
  return {
    ok: false,
    error: {
      code: "WORKER_RESTARTED",
      messageKey: "file.workerRestarted",
      params: {},
      retryable: true,
    },
  };
}

function replyData(value: unknown): { id: string; result: Result<unknown> } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  try {
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 2 || !keys.includes("id") || !keys.includes("result")) {
      return null;
    }
    const id = Object.getOwnPropertyDescriptor(value, "id");
    const result = Object.getOwnPropertyDescriptor(value, "result");
    if (!id || !("value" in id) || typeof id.value !== "string" ||
      !result || !("value" in result) || typeof result.value !== "object" ||
      result.value === null) {
      return null;
    }
    return { id: id.value, result: result.value as Result<unknown> };
  } catch {
    return null;
  }
}

export class IoPortClient {
  private readonly pending = new Map<string, PendingRequest>();
  private port: RendererPort | null = null;
  private receivedPort = false;
  private nextId = 1;

  attach(port: RendererPort): void {
    if (this.receivedPort) {
      this.failPending();
      this.port?.close();
    }
    this.receivedPort = true;
    this.port = port;
    port.onmessage = (event) => this.receive(event.data);
    port.start();
    for (const [id, pending] of this.pending) {
      port.postMessage({ id, ...pending.operation });
    }
  }

  request<T>(operation: PortOperation): Promise<Result<T>> {
    const id = `io-${this.nextId++}`;
    return new Promise((resolve) => {
      this.pending.set(id, {
        operation,
        resolve: (result) => resolve(result as Result<T>),
      });
      this.port?.postMessage({ id, ...operation });
    });
  }

  private receive(value: unknown): void {
    const reply = replyData(value);
    if (!reply) {
      return;
    }
    const pending = this.pending.get(reply.id);
    if (pending) {
      this.pending.delete(reply.id);
      pending.resolve(reply.result);
    }
  }

  private failPending(): void {
    for (const pending of this.pending.values()) {
      pending.resolve(workerRestarted());
    }
    this.pending.clear();
  }
}

interface Api {
  openFile(): Promise<Result<DocumentReference | null>>;
  chooseSaveTarget(request: ChooseSaveTargetRequest): Promise<Result<DocumentReference | null>>;
  readDocument(grant: string): Promise<Result<ReadDocumentResponse>>;
  writeDocument(request: { grant: string; text: string }): Promise<Result<WriteDocumentResponse>>;
  releaseDocument(request: ReleaseDocumentRequest): Promise<Result<void>>;
  openExternal(url: string): Promise<Result<void>>;
  readyForOpenRequests(): Promise<Result<OpenRequestReady>>;
  onMenuCommand(listener: (command: MenuCommand) => void): () => void;
  onOpenRequest(listener: (request: Result<DocumentReference>) => void): () => void;
}

const ioClient = new IoPortClient();
ipcRenderer.on(IO_PORT_CHANNEL, (event: Electron.IpcRendererEvent) => {
  const port = event.ports[0] as unknown as RendererPort | undefined;
  if (port) {
    ioClient.attach(port);
  }
});

const api: Api = {
  openFile: () => ipcRenderer.invoke(FILE_CHANNELS.openFile, {}) as Promise<
    Result<DocumentReference | null>
  >,
  chooseSaveTarget: (request) => ipcRenderer.invoke(
    FILE_CHANNELS.chooseSaveTarget,
    request,
  ) as Promise<Result<DocumentReference | null>>,
  readDocument: (grant) => ioClient.request({ op: "read", grant }),
  writeDocument: ({ grant, text }) => ioClient.request({ op: "write", grant, text }),
  releaseDocument: (request) => ipcRenderer.invoke(
    FILE_CHANNELS.releaseDocument,
    request,
  ) as Promise<Result<void>>,
  openExternal: (url) => ipcRenderer.invoke(
    LINK_CHANNELS.openExternal,
    { url },
  ) as Promise<Result<void>>,
  readyForOpenRequests: () => ipcRenderer.invoke(
    FILE_CHANNELS.openRequestsReady,
    {},
  ) as Promise<Result<OpenRequestReady>>,
  onMenuCommand: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, command: MenuCommand) => {
      listener(command);
    };
    ipcRenderer.on(MENU_CHANNELS.command, handler);
    return () => ipcRenderer.removeListener(MENU_CHANNELS.command, handler);
  },
  onOpenRequest: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      request: Result<DocumentReference>,
    ) => {
      listener(request);
    };
    ipcRenderer.on(FILE_CHANNELS.openRequest, handler);
    return () => ipcRenderer.removeListener(FILE_CHANNELS.openRequest, handler);
  },
};

contextBridge.exposeInMainWorld("api", api);
