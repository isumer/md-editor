export const WORKSPACE_CHANNELS = {
  chooseRoot: "workspace:choose-root",
  listChildren: "workspace:list-children",
  openFile: "workspace:open-file",
} as const;

export interface WorkspaceRoot {
  readonly name: string;
}

export interface WorkspaceEntry {
  readonly name: string;
  readonly kind: "folder" | "file";
}

export interface WorkspacePathRequest {
  readonly path: string;
}

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

export const workspaceContracts = {
  chooseRoot: {
    channel: WORKSPACE_CHANNELS.chooseRoot,
    validate: isChooseRootRequest,
  },
  listChildren: {
    channel: WORKSPACE_CHANNELS.listChildren,
    validate: isWorkspacePathRequest,
  },
  openFile: {
    channel: WORKSPACE_CHANNELS.openFile,
    validate: isWorkspacePathRequest,
  },
} as const;

export type ChooseWorkspaceRootResponse = WorkspaceRoot | null;
export type ListWorkspaceChildrenResponse = readonly WorkspaceEntry[];
export type OpenWorkspaceFileResponse = WorkspaceDocumentReference;
