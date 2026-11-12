import {
  controlRequestId,
  isIoControlRequest,
  type ReadSessionRequest,
  type ReadSettingsRequest,
  type RegisterGrantReply,
  type ResolveAssetReply,
  type ResolveWorkspaceFileReply,
  type SettingsReadReply,
  type SettingsWriteReply,
  type SessionReadReply,
  type SessionWriteReply,
  type WriteSessionRequest,
  type WriteSettingsRequest,
} from "../shared/ipc/ioControl";
import { serviceError, toServiceError } from "../shared/ipc/result";
import type { IoGrantTable } from "./grants";
import { IoPortRegistry, type IoWorkerPort } from "./port";
import type { IoFileService } from "./services/file";
import { IoWorkspaceService } from "./services/workspace";
import { SessionStore } from "./services/session";
import { SettingsStore } from "./services/settings";

export interface IoParentPort {
  on(
    event: "message",
    listener: (event: { data: unknown; ports: IoWorkerPort[] }) => void,
  ): this;
  postMessage(message: unknown): void;
}

export class IoControlHandler {
  private readonly ports: IoPortRegistry;

  constructor(
    private readonly parent: IoParentPort,
    private readonly grants: IoGrantTable,
    private readonly files: IoFileService,
    private readonly sessions: SessionStore = new SessionStore(),
    private readonly settings: SettingsStore = new SettingsStore(),
    private readonly workspaces: IoWorkspaceService = new IoWorkspaceService(grants),
  ) {
    this.ports = new IoPortRegistry(files, workspaces);
  }

  start(): void {
    this.parent.on("message", (event) => {
      this.handle(event.data, event.ports);
    });
  }

  handle(data: unknown, ports: IoWorkerPort[]): void {
    if (!isIoControlRequest(data)) {
      const id = controlRequestId(data);
      if (id) {
        this.parent.postMessage({
          id,
          result: {
            ok: false,
            error: serviceError("BAD_REQUEST", "request.invalid"),
          },
        } satisfies RegisterGrantReply);
      }
      return;
    }
    if (data.type === "registerGrant") {
      void this.register(data);
    } else if (data.type === "resolveAsset") {
      void this.resolveAsset(data);
    } else if (data.type === "resolveWorkspaceFile") {
      void this.resolveWorkspaceFile(data);
    } else if (data.type === "readSession") {
      void this.readSession(data);
    } else if (data.type === "writeSession") {
      void this.writeSession(data);
    } else if (data.type === "readSettings") {
      void this.readSettings(data);
    } else if (data.type === "writeSettings") {
      void this.writeSettings(data);
    } else if (data.type === "revokeGrant") {
      this.grants.revoke(data.windowId, data.handle);
    } else if (data.type === "revokeWindow") {
      this.grants.revokeWindow(data.windowId);
      this.workspaces.revokeWindow(data.windowId);
      this.ports.revokeWindow(data.windowId);
    } else if (ports.length === 1 && ports[0]) {
      this.ports.attach(data.windowId, ports[0]);
    }
  }

  private async register(request: {
    id: string;
    windowId: number;
    handle: string;
    path: string;
    mustExist: boolean;
    kind: "document" | "root";
  }): Promise<void> {
    try {
      const value = await this.files.registerGrant(
        request.windowId,
        request.handle,
        request.path,
        request.mustExist,
        request.kind,
      );
      if (request.kind === "root") this.workspaces.watchRoot(request.windowId, request.handle);
      this.parent.postMessage({
        id: request.id,
        result: { ok: true, value },
      } satisfies RegisterGrantReply);
    } catch (error) {
      this.parent.postMessage({
        id: request.id,
        result: { ok: false, error: toServiceError(error) },
      } satisfies RegisterGrantReply);
    }
  }

  private async resolveAsset(request: {
    id: string;
    windowId: number;
    grant: string;
    relativePath: string;
  }): Promise<void> {
    try {
      const value = await this.files.resolveAsset(
        request.windowId,
        request.grant,
        request.relativePath,
      );
      this.parent.postMessage({
        id: request.id,
        result: { ok: true, value },
      } satisfies ResolveAssetReply);
    } catch (error) {
      this.parent.postMessage({
        id: request.id,
        result: { ok: false, error: toServiceError(error) },
      } satisfies ResolveAssetReply);
    }
  }

  private async resolveWorkspaceFile(request: {
    id: string;
    windowId: number;
    grant: string;
    relativePath: string;
  }): Promise<void> {
    try {
      const path = await this.workspaces.resolveFile(
        request.windowId,
        request.grant,
        request.relativePath,
      );
      this.parent.postMessage({
        id: request.id,
        result: { ok: true, value: { path } },
      } satisfies ResolveWorkspaceFileReply);
    } catch (error) {
      this.parent.postMessage({
        id: request.id,
        result: { ok: false, error: toServiceError(error) },
      } satisfies ResolveWorkspaceFileReply);
    }
  }

  private async readSession(request: ReadSessionRequest): Promise<void> {
    try {
      const value = await this.sessions.read(request.path);
      this.parent.postMessage({
        id: request.id,
        result: { ok: true, value },
      } satisfies SessionReadReply);
    } catch (error) {
      this.parent.postMessage({
        id: request.id,
        result: { ok: false, error: toServiceError(error) },
      } satisfies SessionReadReply);
    }
  }

  private async writeSession(request: WriteSessionRequest): Promise<void> {
    try {
      await this.sessions.write(request.path, request.session);
      this.parent.postMessage({
        id: request.id,
        result: { ok: true, value: {} },
      } satisfies SessionWriteReply);
    } catch (error) {
      this.parent.postMessage({
        id: request.id,
        result: { ok: false, error: toServiceError(error) },
      } satisfies SessionWriteReply);
    }
  }

  private async readSettings(request: ReadSettingsRequest): Promise<void> {
    try {
      const value = await this.settings.read(request.path);
      this.parent.postMessage({
        id: request.id,
        result: { ok: true, value },
      } satisfies SettingsReadReply);
    } catch (error) {
      this.parent.postMessage({
        id: request.id,
        result: { ok: false, error: toServiceError(error) },
      } satisfies SettingsReadReply);
    }
  }

  private async writeSettings(request: WriteSettingsRequest): Promise<void> {
    try {
      await this.settings.write(request.path, request.settings);
      this.parent.postMessage({
        id: request.id,
        result: { ok: true, value: {} },
      } satisfies SettingsWriteReply);
    } catch (error) {
      this.parent.postMessage({
        id: request.id,
        result: { ok: false, error: toServiceError(error) },
      } satisfies SettingsWriteReply);
    }
  }
}
