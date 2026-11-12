import path from "node:path";

import type { DocumentReference } from "../../shared/ipc/file";
import type { RegisteredGrant } from "../../shared/ipc/ioControl";
import { serviceError, type Result } from "../../shared/ipc/result";
import type { WorkspaceRoot } from "../../shared/ipc/workspace";
import { checkWorkspacePath } from "../../shared/workspace/workspacePath";
import type { GrantTable } from "../grants/grantTable";
import type { DocumentGrantService } from "./documentGrants";

interface WorkspaceDialogs {
  chooseFolderPath(windowId: number): Promise<string | null>;
}

interface WorkspaceControl {
  registerGrant(
    windowId: number,
    handle: string,
    filePath: string,
    mustExist: boolean,
    kind: "document" | "root",
  ): Promise<Result<RegisteredGrant>>;
  revokeGrant(windowId: number, handle: string): Promise<void>;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export class WorkspaceService {
  private readonly roots = new Map<number, string>();

  constructor(
    private readonly dialogs: WorkspaceDialogs,
    private readonly documents: DocumentGrantService,
    private readonly grants: GrantTable,
    private readonly control: WorkspaceControl,
  ) {}

  async chooseRoot(windowId: number): Promise<WorkspaceRoot | null> {
    const selected = await this.dialogs.chooseFolderPath(windowId);
    if (selected === null) return null;
    const current = this.roots.get(windowId);
    const handle = this.grants.createHandle(windowId);
    const result = await this.control.registerGrant(windowId, handle, selected, true, "root");
    if (!result.ok) throw result.error;
    this.grants.register(windowId, handle, result.value.canonicalPath, "root");
    this.roots.set(windowId, handle);
    if (current) await this.releaseRootGrant(windowId, current);
    return { grant: handle, name: result.value.name };
  }

  async openFile(windowId: number, relativePath: string): Promise<DocumentReference> {
    const grant = this.roots.get(windowId);
    if (!grant) throw serviceError("BAD_REQUEST", "request.invalid");
    const checked = checkWorkspacePath(relativePath);
    const root = this.grants.resolve(windowId, grant);
    if (!checked.ok || !root.ok || !relativePath.toLowerCase().endsWith(".md")) {
      throw serviceError("BAD_REQUEST", "request.invalid");
    }
    const opened = await this.documents.openPath(
      windowId,
      path.resolve(root.value, ...checked.segments),
    );
    if (isInside(root.value, opened.canonicalPath)) return opened;
    await this.documents.release(windowId, opened.grant);
    throw serviceError("BAD_REQUEST", "request.invalid");
  }

  closeWindow(windowId: number): void {
    this.roots.delete(windowId);
  }

  private async releaseRootGrant(windowId: number, handle: string): Promise<void> {
    this.grants.revokeRoot(windowId, handle);
    await this.control.revokeGrant(windowId, handle);
  }
}
