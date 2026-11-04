import { randomBytes } from "node:crypto";

import {
  serviceError,
  type Result,
} from "../../shared/ipc/result";

export type GrantKind = "document";

interface Grant {
  canonicalPath: string;
  kind: GrantKind;
}

export class GrantTable {
  private readonly windows = new Map<number, Map<string, Grant>>();

  issue(windowId: number, canonicalPath: string, kind: GrantKind): string {
    const windowGrants = this.windows.get(windowId) ?? new Map<string, Grant>();
    this.windows.set(windowId, windowGrants);
    let handle: string;
    do {
      handle = randomBytes(16).toString("base64url");
    } while (windowGrants.has(handle));
    windowGrants.set(handle, { canonicalPath, kind });
    return handle;
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

  revokeWindow(windowId: number): void {
    this.windows.delete(windowId);
  }
}
