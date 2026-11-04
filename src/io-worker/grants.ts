import { serviceError } from "../shared/ipc/result";

export class IoGrantTable {
  private readonly windows = new Map<number, Map<string, string>>();

  register(windowId: number, handle: string, canonicalPath: string): void {
    const grants = this.windows.get(windowId) ?? new Map<string, string>();
    grants.set(handle, canonicalPath);
    this.windows.set(windowId, grants);
  }

  resolve(windowId: number, handle: string): string {
    const filePath = this.windows.get(windowId)?.get(handle);
    if (!filePath) {
      throw serviceError("GRANT_INVALID", "grant.invalid");
    }
    return filePath;
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
