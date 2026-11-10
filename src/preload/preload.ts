/* eslint-disable max-lines -- The sandboxed preload can import only Electron and types. */
import { contextBridge, ipcRenderer, webUtils } from "electron";

import type {
  ChooseSaveTargetRequest,
  DocumentReference,
  FILE_CHANNELS as SharedFileChannels,
  OpenPathRequest,
  OpenRequestReady,
  ReleaseDocumentRequest,
} from "../shared/ipc/file";
import type {
  AttachDocumentInput,
  ChangeDocumentMessage,
  ClearDraftMessage,
  DetachDocumentMessage,
  DraftDocumentInput,
  IO_PORT_CHANNEL as SharedIoPortChannel,
  IO_PORT_LOST_CHANNEL as SharedIoPortLostChannel,
  ListDraftsResponse,
  ReadDocumentResponse,
  SaveDocumentInput,
  SaveDocumentResponse,
} from "../shared/ipc/io";
import type { LINK_CHANNELS as SharedLinkChannels } from "../shared/ipc/link";
import type {
  MENU_CHANNELS as SharedMenuChannels,
  MenuCommandMessage,
  MenuContribution,
} from "../shared/ipc/menu";
import type { Result } from "../shared/ipc/result";
import type {
  SESSION_CHANNELS as SharedSessionChannels,
  SessionCloseRequest,
  SessionCloseResult,
  SessionLoadResponse,
} from "../shared/ipc/session";
import type {
  ChooseWorkspaceRootResponse,
  ListWorkspaceChildrenResponse,
  OpenWorkspaceFileResponse,
  WORKSPACE_CHANNELS as SharedWorkspaceChannels,
  WorkspacePathRequest,
} from "../shared/ipc/workspace";

const FILE_CHANNELS = {
  openFile: "file:open",
  openPath: "file:open-path",
  chooseSaveTarget: "file:choose-save-target",
  releaseDocument: "file:release-document",
  openRequestsReady: "file:open-requests-ready",
  openRequest: "file:open-request",
} as const satisfies typeof SharedFileChannels;
const IO_PORT_CHANNEL = "io:port" as const satisfies typeof SharedIoPortChannel;
const IO_PORT_LOST_CHANNEL = "io:port-lost" as const satisfies
  typeof SharedIoPortLostChannel;
const LINK_CHANNELS = {
  openExternal: "link:open-external",
} as const satisfies typeof SharedLinkChannels;
const MENU_CHANNELS = {
  command: "menu:command",
  contribute: "menu:contribute",
} as const satisfies typeof SharedMenuChannels;
const SESSION_CHANNELS = {
  load: "session:load",
  requestClose: "session:request-close",
  closeResult: "session:close-result",
} as const satisfies typeof SharedSessionChannels;
const WORKSPACE_CHANNELS = {
  chooseRoot: "workspace:choose-root",
  listChildren: "workspace:list-children",
  openFile: "workspace:open-file",
} as const satisfies typeof SharedWorkspaceChannels;

interface RendererPort {
  onmessage: ((event: { data: unknown }) => void) | null;
  close(): void;
  postMessage(message: unknown): void;
  start(): void;
}

type PortOperation =
  | { op: "read"; grant: string }
  | ({ op: "attach" } & AttachDocumentInput)
  | ({ op: "save" } & SaveDocumentInput)
  | ({ op: "draft" } & DraftDocumentInput)
  | { op: "drafts" };
type PortOneWay = ChangeDocumentMessage | DetachDocumentMessage | ClearDraftMessage;

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

function exactData(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  try {
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== keys.length || ownKeys.some((key) =>
      typeof key !== "string" || !keys.includes(key))) {
      return null;
    }
    const data: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) {
        return null;
      }
      data[key] = descriptor.value;
    }
    return data;
  } catch {
    return null;
  }
}

function validParams(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    return Reflect.ownKeys(value).every((key) => {
      const descriptor = typeof key === "string"
        ? Object.getOwnPropertyDescriptor(value, key)
        : undefined;
      return descriptor !== undefined && "value" in descriptor &&
        typeof descriptor.value === "string";
    });
  } catch {
    return false;
  }
}

function validFailure(value: unknown): boolean {
  const failure = exactData(value, ["ok", "error"]);
  const error = failure?.["ok"] === false
    ? exactData(failure["error"], ["code", "messageKey", "params", "retryable"])
    : null;
  return error !== null && typeof error["code"] === "string" &&
    typeof error["messageKey"] === "string" && validParams(error["params"]) &&
    typeof error["retryable"] === "boolean";
}

function validDrafts(value: unknown): boolean {
  const list = exactData(value, ["drafts"]);
  if (!list || !Array.isArray(list["drafts"])) {
    return false;
  }
  return (list["drafts"] as readonly unknown[]).every((draft) => {
    const entry = exactData(draft, ["docId", "grant", "text"]);
    return entry !== null && typeof entry["docId"] === "string" &&
      entry["docId"].length > 0 && entry["docId"].length <= 128 &&
      (entry["grant"] === null ||
        (typeof entry["grant"] === "string" && entry["grant"].length > 0)) &&
      typeof entry["text"] === "string";
  });
}

function validSuccessValue(value: unknown, operation: PortOperation["op"]): boolean {
  if (operation === "attach" || operation === "draft") {
    return exactData(value, []) !== null;
  }
  if (operation === "drafts") {
    return validDrafts(value);
  }
  if (operation === "read") {
    const read = exactData(value, ["canonicalPath", "name", "text"]);
    return read !== null && typeof read["canonicalPath"] === "string" &&
      read["canonicalPath"].length > 0 && typeof read["name"] === "string" &&
      typeof read["text"] === "string";
  }
  const save = exactData(value, ["name", "version"]);
  return save !== null && typeof save["name"] === "string" &&
    typeof save["version"] === "number" && Number.isSafeInteger(save["version"]) &&
    save["version"] >= 0;
}

function boundaryResult(
  value: unknown,
  operation: PortOperation["op"],
): Result<unknown> | null {
  const success = exactData(value, ["ok", "value"]);
  if (success?.["ok"] === true && validSuccessValue(success["value"], operation)) {
    return value as Result<unknown>;
  }
  return validFailure(value) ? value as Result<unknown> : null;
}

function replyData(value: unknown): { id: string; result: unknown } | null {
  const reply = exactData(value, ["id", "result"]);
  return reply && typeof reply["id"] === "string" && reply["id"].length > 0 &&
      reply["id"].length <= 128
    ? { id: reply["id"], result: reply["result"] }
    : null;
}

export class IoPortClient {
  private readonly pending = new Map<string, PendingRequest>();
  private queued: unknown[] = [];
  private port: RendererPort | null = null;
  private nextId = 1;

  attach(port: RendererPort): void {
    if (this.port) {
      this.failPending();
      this.port.close();
    }
    this.port = port;
    port.onmessage = (event) => this.receive(event.data);
    port.start();
    for (const message of this.queued) {
      port.postMessage(message);
    }
    this.queued = [];
  }

  portLost(): void {
    if (!this.port) {
      return;
    }
    this.failPending();
    this.port.close();
    this.port = null;
  }

  request<T>(operation: PortOperation): Promise<Result<T>> {
    const id = `io-${this.nextId++}`;
    return new Promise((resolve) => {
      this.pending.set(id, {
        operation,
        resolve: (result) => resolve(result as Result<T>),
      });
      this.post({ id, ...operation });
    });
  }

  send(message: PortOneWay): void {
    this.post(message);
  }

  private post(message: unknown): void {
    if (this.port) {
      this.port.postMessage(message);
    } else {
      this.queued.push(message);
    }
  }

  private receive(value: unknown): void {
    const reply = replyData(value);
    if (!reply) {
      return;
    }
    const pending = this.pending.get(reply.id);
    const result = pending ? boundaryResult(reply.result, pending.operation.op) : null;
    if (pending && result) {
      this.pending.delete(reply.id);
      pending.resolve(result);
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
  attachDocument(request: AttachDocumentInput): Promise<Result<void>>;
  saveDocument(request: SaveDocumentInput): Promise<Result<SaveDocumentResponse>>;
  draftDocument(request: DraftDocumentInput): Promise<Result<void>>;
  listDrafts(): Promise<Result<ListDraftsResponse>>;
  clearDraft(request: Omit<ClearDraftMessage, "op">): void;
  sendChanges(request: Omit<ChangeDocumentMessage, "op">): void;
  detachDocument(request: Omit<DetachDocumentMessage, "op">): void;
  releaseDocument(request: ReleaseDocumentRequest): Promise<Result<void>>;
  openExternal(url: string): Promise<Result<void>>;
  readyForOpenRequests(): Promise<Result<OpenRequestReady>>;
  onMenuCommand(listener: (command: MenuCommandMessage) => void): () => void;
  contributeMenu(request: MenuContribution): Promise<Result<void>>;
  onOpenRequest(listener: (request: Result<DocumentReference>) => void): () => void;
  loadSession(): Promise<Result<SessionLoadResponse>>;
  respondSessionClose(result: SessionCloseResult): Promise<Result<void>>;
  onSessionCloseRequest(listener: (request: SessionCloseRequest) => void): () => void;
  chooseWorkspaceRoot(): Promise<Result<ChooseWorkspaceRootResponse>>;
  listWorkspaceChildren(request: WorkspacePathRequest): Promise<
    Result<ListWorkspaceChildrenResponse>
  >;
  openWorkspaceFile(request: WorkspacePathRequest): Promise<
    Result<OpenWorkspaceFileResponse>
  >;
}

const openRequestListeners = new Set<(request: Result<DocumentReference>) => void>();

type DropFile = Parameters<typeof webUtils.getPathForFile>[0];

interface TrustedDropEvent {
  readonly dataTransfer: { readonly files: ArrayLike<DropFile> } | null;
  readonly isTrusted: boolean;
  preventDefault(): void;
}

interface DropTarget {
  addEventListener(type: "drop", listener: (event: TrustedDropEvent) => void): void;
}

function deliverOpenRequest(request: Result<DocumentReference>): void {
  for (const listener of openRequestListeners) {
    listener(request);
  }
}

async function openDroppedFiles(event: TrustedDropEvent): Promise<void> {
  if (!event.isTrusted) {
    return;
  }
  event.preventDefault();
  for (const file of Array.from(event.dataTransfer?.files ?? [])) {
    const path = webUtils.getPathForFile(file);
    if (!path) {
      continue;
    }
    const result = await ipcRenderer.invoke(
      FILE_CHANNELS.openPath,
      { path } satisfies OpenPathRequest,
    ) as Result<DocumentReference>;
    deliverOpenRequest(result);
  }
}

const ioClient = new IoPortClient();
ipcRenderer.on(IO_PORT_CHANNEL, (event: Electron.IpcRendererEvent) => {
  const port = event.ports[0] as unknown as RendererPort | undefined;
  if (port) {
    ioClient.attach(port);
  }
});
ipcRenderer.on(IO_PORT_LOST_CHANNEL, () => ioClient.portLost());

const api: Api = {
  openFile: () => ipcRenderer.invoke(FILE_CHANNELS.openFile, {}) as Promise<
    Result<DocumentReference | null>
  >,
  chooseSaveTarget: (request) => ipcRenderer.invoke(
    FILE_CHANNELS.chooseSaveTarget,
    request,
  ) as Promise<Result<DocumentReference | null>>,
  readDocument: (grant) => ioClient.request({ op: "read", grant }),
  attachDocument: ({ docId, epoch, version, text }) => ioClient.request({
    op: "attach",
    docId,
    epoch,
    version,
    text,
  }),
  saveDocument: ({ grant, docId, epoch, version }) => ioClient.request({
    op: "save",
    grant,
    docId,
    epoch,
    version,
  }),
  draftDocument: ({ grant, docId, epoch, version }) => ioClient.request({
    op: "draft",
    grant,
    docId,
    epoch,
    version,
  }),
  listDrafts: () => ioClient.request({ op: "drafts" }),
  clearDraft: ({ docId }) => ioClient.send({ op: "clear-draft", docId }),
  sendChanges: ({ docId, epoch, fromVersion, toVersion, changes }) => ioClient.send({
    op: "change",
    docId,
    epoch,
    fromVersion,
    toVersion,
    changes,
  }),
  detachDocument: ({ docId }) => ioClient.send({ op: "detach", docId }),
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
    const handler = (_event: Electron.IpcRendererEvent, command: MenuCommandMessage) => {
      listener(command);
    };
    ipcRenderer.on(MENU_CHANNELS.command, handler);
    return () => ipcRenderer.removeListener(MENU_CHANNELS.command, handler);
  },
  contributeMenu: (request) => ipcRenderer.invoke(
    MENU_CHANNELS.contribute,
    request,
  ) as Promise<Result<void>>,
  onOpenRequest: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      request: Result<DocumentReference>,
    ) => {
      listener(request);
    };
    ipcRenderer.on(FILE_CHANNELS.openRequest, handler);
    openRequestListeners.add(listener);
    return () => {
      openRequestListeners.delete(listener);
      ipcRenderer.removeListener(FILE_CHANNELS.openRequest, handler);
    };
  },
  loadSession: () => ipcRenderer.invoke(
    SESSION_CHANNELS.load,
    {},
  ) as Promise<Result<SessionLoadResponse>>,
  respondSessionClose: (result) => ipcRenderer.invoke(
    SESSION_CHANNELS.closeResult,
    result,
  ) as Promise<Result<void>>,
  onSessionCloseRequest: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      request: SessionCloseRequest,
    ) => {
      listener(request);
    };
    ipcRenderer.on(SESSION_CHANNELS.requestClose, handler);
    return () => ipcRenderer.removeListener(SESSION_CHANNELS.requestClose, handler);
  },
  chooseWorkspaceRoot: () => ipcRenderer.invoke(
    WORKSPACE_CHANNELS.chooseRoot,
    {},
  ) as Promise<Result<ChooseWorkspaceRootResponse>>,
  listWorkspaceChildren: (request) => ipcRenderer.invoke(
    WORKSPACE_CHANNELS.listChildren,
    request,
  ) as Promise<Result<ListWorkspaceChildrenResponse>>,
  openWorkspaceFile: (request) => ipcRenderer.invoke(
    WORKSPACE_CHANNELS.openFile,
    request,
  ) as Promise<Result<OpenWorkspaceFileResponse>>,
};

const dropTarget = globalThis as unknown as Partial<DropTarget>;
if (typeof dropTarget.addEventListener === "function") {
  dropTarget.addEventListener("drop", (event) => {
    void openDroppedFiles(event).catch(() => undefined);
  });
}

contextBridge.exposeInMainWorld("api", api);
