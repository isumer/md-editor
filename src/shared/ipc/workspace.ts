export const WORKSPACE_CHANNELS = {
  change: "workspace:change",
  chooseRoot: "workspace:choose-root",
  createFile: "workspace:create-file",
  deleteFile: "workspace:delete-file",
  listChildren: "workspace:list-children",
  openFile: "workspace:open-file",
  renameFile: "workspace:rename-file",
} as const;

export interface WorkspaceRoot {
  readonly grant: string;
  readonly name: string;
}

export interface WorkspaceEntry {
  readonly name: string;
  readonly kind: "folder" | "file";
}

export interface WorkspacePathRequest {
  readonly path: string;
}

export interface RenameWorkspaceFileRequest extends WorkspacePathRequest {
  readonly newPath: string;
}

export type WorkspaceChangeMessage =
  | {
      readonly canonicalPath: string;
      readonly entryKind: "folder" | "file";
      readonly kind: "created";
      readonly path: string;
    }
  | {
      readonly canonicalPath: string;
      readonly kind: "changed" | "deleted";
      readonly path: string;
    };

export interface WorkspaceDocumentReference {
  readonly canonicalPath: string;
  readonly grant: string;
  readonly name: string;
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
    const record: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) {
        return null;
      }
      record[key] = descriptor.value;
    }
    return record;
  } catch {
    return null;
  }
}

function isChooseRootRequest(value: unknown): value is Record<string, never> {
  return exactData(value, []) !== null;
}

function isWorkspacePathRequest(value: unknown): value is WorkspacePathRequest {
  const request = exactData(value, ["path"]);
  return request !== null && typeof request["path"] === "string" &&
    request["path"].length <= 32 * 1024 && !request["path"].includes("\u0000");
}

function isRenameWorkspaceFileRequest(value: unknown): value is RenameWorkspaceFileRequest {
  const request = exactData(value, ["path", "newPath"]);
  return request !== null && [request["path"], request["newPath"]].every((entry) =>
    typeof entry === "string" && entry.length <= 32 * 1024 && !entry.includes("\u0000"));
}

export const workspaceContracts = {
  chooseRoot: {
    channel: WORKSPACE_CHANNELS.chooseRoot,
    validate: isChooseRootRequest,
  },
  createFile: {
    channel: WORKSPACE_CHANNELS.createFile,
    validate: isWorkspacePathRequest,
  },
  deleteFile: {
    channel: WORKSPACE_CHANNELS.deleteFile,
    validate: isWorkspacePathRequest,
  },
  listChildren: {
    channel: WORKSPACE_CHANNELS.listChildren,
    validate: isWorkspacePathRequest,
  },
  openFile: {
    channel: WORKSPACE_CHANNELS.openFile,
    validate: isWorkspacePathRequest,
  },
  renameFile: {
    channel: WORKSPACE_CHANNELS.renameFile,
    validate: isRenameWorkspaceFileRequest,
  },
} as const;

export type ChooseWorkspaceRootResponse = WorkspaceRoot | null;
export type ListWorkspaceChildrenResponse = readonly WorkspaceEntry[];
export type OpenWorkspaceFileResponse = WorkspaceDocumentReference;
export type WorkspaceFileActionResponse = void;
