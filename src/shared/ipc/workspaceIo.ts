export interface WorkspaceEntry {
  readonly name: string;
  readonly kind: "folder" | "file";
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

interface WorkspaceIoBase {
  readonly grant: string;
  readonly id: string;
}

export interface ListWorkspaceRequest extends WorkspaceIoBase {
  readonly op: "workspaceList";
  readonly path: string;
}

export interface CreateWorkspaceFileRequest extends WorkspaceIoBase {
  readonly op: "workspaceCreate";
  readonly path: string;
}

export interface DeleteWorkspaceFileRequest extends WorkspaceIoBase {
  readonly op: "workspaceDelete";
  readonly path: string;
}

export interface RenameWorkspaceRequest extends WorkspaceIoBase {
  readonly newPath: string;
  readonly op: "workspaceRename";
  readonly path: string;
}

export type WorkspaceIoRequest =
  | ListWorkspaceRequest
  | CreateWorkspaceFileRequest
  | DeleteWorkspaceFileRequest
  | RenameWorkspaceRequest;

export interface WorkspaceChangeEvent {
  readonly change: WorkspaceChangeMessage;
  readonly op: "workspaceChange";
}

export type WorkspaceIoResponse = readonly WorkspaceEntry[] | Record<string, never>;

export interface WorkspaceIoReply {
  readonly id: string;
  readonly result:
    | { readonly ok: true; readonly value: WorkspaceIoResponse }
    | {
        readonly ok: false;
        readonly error: {
          readonly code: string;
          readonly messageKey: string;
          readonly params: Readonly<Record<string, string>>;
          readonly retryable: boolean;
        };
      };
}

function exactData(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  try {
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== keys.length || ownKeys.some((key) =>
      typeof key !== "string" || !keys.includes(key))) return null;
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

function validText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum &&
    !value.includes("\u0000");
}

export function isWorkspaceIoRequest(value: unknown): value is WorkspaceIoRequest {
  const operation = typeof value === "object" && value !== null
    ? Object.getOwnPropertyDescriptor(value, "op")?.value
    : undefined;
  const keys = operation === "workspaceRename"
    ? ["id", "op", "grant", "path", "newPath"]
    : ["id", "op", "grant", "path"];
  const data = exactData(value, keys);
  if (!data || !validText(data["id"], 128) || !validText(data["grant"], 8 * 1024) ||
    typeof data["path"] !== "string" || data["path"].length > 32 * 1024 ||
    data["path"].includes("\u0000")) return false;
  if (operation === "workspaceRename") {
    return typeof data["newPath"] === "string" && data["newPath"].length <= 32 * 1024 &&
      !data["newPath"].includes("\u0000");
  }
  return operation === "workspaceList" || operation === "workspaceCreate" ||
    operation === "workspaceDelete";
}

