import type { DocumentReference } from "../../shared/ipc/file";
import type { RegisteredGrant } from "../../shared/ipc/ioControl";
import type { Result } from "../../shared/ipc/result";
import { GrantTable } from "../grants/grantTable";
import type { FileDialogs } from "./fileDialogs";

export interface GrantControl {
  registerGrant(
    windowId: number,
    handle: string,
    filePath: string,
    mustExist: boolean,
  ): Promise<Result<RegisteredGrant>>;
  revokeGrant(windowId: number, handle: string): Promise<void>;
  revokeWindow(windowId: number): Promise<void>;
}

export class DocumentGrantService {
  constructor(
    private readonly grants: GrantTable,
    private readonly dialogs: FileDialogs,
    private readonly control: GrantControl,
  ) {}

  async open(windowId: number): Promise<DocumentReference | null> {
    const filePath = await this.dialogs.chooseOpenPath(windowId);
    return filePath ? this.openPath(windowId, filePath) : null;
  }

  openPath(windowId: number, filePath: string): Promise<DocumentReference> {
    return this.register(windowId, filePath, true);
  }

  async chooseSaveTarget(
    windowId: number,
    currentGrant: string | null,
  ): Promise<DocumentReference | null> {
    const currentPath = currentGrant ? this.resolve(windowId, currentGrant) : null;
    const filePath = await this.dialogs.chooseSavePath(windowId, currentPath);
    return filePath ? this.register(windowId, filePath, false) : null;
  }

  async release(windowId: number, handle: string): Promise<void> {
    this.grants.revokeDocument(windowId, handle);
    await this.control.revokeGrant(windowId, handle);
  }

  async closeWindow(windowId: number): Promise<void> {
    this.grants.revokeWindow(windowId);
    await this.control.revokeWindow(windowId);
  }

  private async register(
    windowId: number,
    filePath: string,
    mustExist: boolean,
  ): Promise<DocumentReference> {
    const handle = this.grants.createHandle(windowId);
    const result = await this.control.registerGrant(
      windowId,
      handle,
      filePath,
      mustExist,
    );
    if (!result.ok) {
      throw result.error;
    }
    this.grants.register(windowId, handle, result.value.canonicalPath, "document");
    return { grant: handle, name: result.value.name };
  }

  private resolve(windowId: number, handle: string): string {
    const result = this.grants.resolve(windowId, handle);
    if (!result.ok) {
      throw result.error;
    }
    return result.value;
  }
}
