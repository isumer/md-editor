import {
  controlRequestId,
  isIoControlRequest,
  type RegisterGrantReply,
  type ResolveAssetReply,
} from "../shared/ipc/ioControl";
import { serviceError, toServiceError } from "../shared/ipc/result";
import type { IoGrantTable } from "./grants";
import { IoPortRegistry, type IoWorkerPort } from "./port";
import type { IoFileService } from "./services/file";

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
  ) {
    this.ports = new IoPortRegistry(files);
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
    } else if (data.type === "revokeGrant") {
      this.grants.revoke(data.windowId, data.handle);
    } else if (data.type === "revokeWindow") {
      this.grants.revokeWindow(data.windowId);
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
  }): Promise<void> {
    try {
      const value = await this.files.registerGrant(
        request.windowId,
        request.handle,
        request.path,
        request.mustExist,
      );
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
}
