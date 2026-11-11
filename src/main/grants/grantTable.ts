import { randomBytes } from "node:crypto";

import {
  serviceError,
  type Result,
} from "../../shared/ipc/result";

export type GrantKind = "document" | "export";

export interface GrantEntry {
  handle: string;
  canonicalPath: string;
  kind: GrantKind;
}

type Grant = Omit<GrantEntry, "handle">;

export class GrantTable {
  private readonly windows = new Map<number, Map<string, Grant>>();

  issue(windowId: number, canonicalPath: string, kind: GrantKind): string {
    const handle = this.createHandle(windowId);
    this.register(windowId, handle, canonicalPath, kind);
    return handle;
  }

  createHandle(windowId: number): string {
    const windowGrants = this.windows.get(windowId) ?? new Map<string, Grant>();
    let handle: string;
    do {
      handle = randomBytes(16).toString("base64url");
    } while (windowGrants.has(handle));
    return handle;
  }

  register(
    windowId: number,
    handle: string,
    canonicalPath: string,
    kind: GrantKind,
  ): void {
    const windowGrants = this.windows.get(windowId) ?? new Map<string, Grant>();
    windowGrants.set(handle, { canonicalPath, kind });
    this.windows.set(windowId, windowGrants);
  }

  resolve(windowId: number, handle: string): Result<string> {
    const grant = this.windows.get(windowId)?.get(handle);
    return grant
      ? { ok: true, value: grant.canonicalPath }
      : {
          ok: false,
          error: serviceError("GRANT_INVALID", "grant.invalid"),
        };
  }

  revokeDocument(windowId: number, handle: string): void {
    const grants = this.windows.get(windowId);
    if (grants?.get(handle)?.kind === "document") {
      grants.delete(handle);
    }
    if (grants?.size === 0) {
      this.windows.delete(windowId);
    }
  }

  revokeExport(windowId: number, handle: string): void {
    const grants = this.windows.get(windowId);
    if (grants?.get(handle)?.kind === "export") grants.delete(handle);
    if (grants?.size === 0) this.windows.delete(windowId);
  }

  revokeWindow(windowId: number): void {
    this.windows.delete(windowId);
  }

  entries(windowId: number): readonly GrantEntry[] {
    return [...(this.windows.get(windowId) ?? [])].map(([handle, grant]) => ({
      handle,
      ...grant,
    }));
  }
}
