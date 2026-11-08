export const FILE_CHANNELS = {
  openFile: "file:open",
  openPath: "file:open-path",
  chooseSaveTarget: "file:choose-save-target",
  releaseDocument: "file:release-document",
  openRequestsReady: "file:open-requests-ready",
  openRequest: "file:open-request",
} as const;

export interface OpenFileRequest {}

export interface OpenPathRequest {
  path: string;
}

export interface ChooseSaveTargetRequest {
  grant: string | null;
}

export interface ReleaseDocumentRequest {
  grant: string;
}

export interface OpenRequestsReadyRequest {}

export interface DocumentReference {
  canonicalPath: string;
  grant: string;
  name: string;
}

export type OpenedFile = DocumentReference;

export interface OpenRequestReady {
  notice: string | null;
  productName: string;
  windowId: number;
}

export type OpenFileResponse = DocumentReference | null;
export type ChooseSaveTargetResponse = DocumentReference | null;
export type ReleaseDocumentResponse = void;
export type OpenRequestsReadyResponse = OpenRequestReady;
export type OpenRequestMessage = DocumentReference;

function exactData(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  try {
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== keys.length ||
      ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))) {
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

function validGrant(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 8 * 1024;
}

export function isOpenFileRequest(value: unknown): value is OpenFileRequest {
  return exactData(value, []) !== null;
}

export function isOpenPathRequest(value: unknown): value is OpenPathRequest {
  const request = exactData(value, ["path"]);
  return request !== null && typeof request["path"] === "string" &&
    request["path"].length > 0 && request["path"].length <= 32 * 1024 &&
    !request["path"].includes("\u0000");
}

export function isChooseSaveTargetRequest(
  value: unknown,
): value is ChooseSaveTargetRequest {
  const request = exactData(value, ["grant"]);
  return request !== null && (request["grant"] === null || validGrant(request["grant"]));
}

export function isReleaseDocumentRequest(
  value: unknown,
): value is ReleaseDocumentRequest {
  const request = exactData(value, ["grant"]);
  return request !== null && validGrant(request["grant"]);
}

export function isOpenRequestsReadyRequest(
  value: unknown,
): value is OpenRequestsReadyRequest {
  return exactData(value, []) !== null;
}

export const fileContracts = {
  openFile: { channel: FILE_CHANNELS.openFile, validate: isOpenFileRequest },
  openPath: { channel: FILE_CHANNELS.openPath, validate: isOpenPathRequest },
  chooseSaveTarget: {
    channel: FILE_CHANNELS.chooseSaveTarget,
    validate: isChooseSaveTargetRequest,
  },
  releaseDocument: {
    channel: FILE_CHANNELS.releaseDocument,
    validate: isReleaseDocumentRequest,
  },
  openRequestsReady: {
    channel: FILE_CHANNELS.openRequestsReady,
    validate: isOpenRequestsReadyRequest,
  },
} as const;
