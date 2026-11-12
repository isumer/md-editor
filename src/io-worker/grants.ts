import { serviceError } from "../shared/ipc/result";

export class IoGrantTable {
  private readonly windows = new Map<number, Map<string, {
    kind: "document" | "root";
    path: string;
  }>>();

  register(
    windowId: number,
    handle: string,
    canonicalPath: string,
    kind: "document" | "root" = "document",
  ): void {
    const grants = this.windows.get(windowId) ?? new Map();
    grants.set(handle, { kind, path: canonicalPath });
    this.windows.set(windowId, grants);
  }

  resolve(windowId: number, handle: string, kind?: "document" | "root"): string {
    const grant = this.windows.get(windowId)?.get(handle);
    if (!grant || (kind !== undefined && grant.kind !== kind)) {
      throw serviceError("GRANT_INVALID", "grant.invalid");
    }
    return grant.path;
  }

  revoke(windowId: number, handle: string): void {
    const grants = this.windows.get(windowId);
    grants?.delete(handle);
    if (grants?.size === 0) {
      this.windows.delete(windowId);
    }
  }

  revokeWindow(windowId: number): void {
    this.windows.delete(windowId);
  }
}
