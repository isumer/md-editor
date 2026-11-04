export const MAX_TEXT_LENGTH = 256 * 1024 * 1024;

export const FILE_CHANNELS = {
  openFile: "file:open",
  saveFile: "file:save",
  saveFileAs: "file:save-as",
  openRequestsReady: "file:open-requests-ready",
  openRequest: "file:open-request",
} as const;

export interface OpenFileRequest {}

export interface SaveFileRequest {
  grant: string | null;
  text: string;
}

export interface OpenRequestsReadyRequest {}

export interface OpenedFile {
  grant: string;
  name: string;
  text: string;
}

export interface SavedFile {
  grant: string;
  name: string;
}

export interface OpenRequestReady {
  notice: string | null;
  productName: string;
}

export type OpenFileResponse = OpenedFile | null;
export type SaveFileResponse = SavedFile | null;
export type SaveFileAsResponse = SavedFile | null;
export type OpenRequestsReadyResponse = OpenRequestReady;
export type OpenRequestMessage = OpenedFile;

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

function validGrant(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length <= 8 * 1024);
}

function validSave(value: unknown): value is SaveFileRequest {
  const record = exactData(value, ["grant", "text"]);
  return record !== null && validGrant(record["grant"]) &&
    typeof record["text"] === "string" && record["text"].length <= MAX_TEXT_LENGTH;
}

export function isOpenFileRequest(value: unknown): value is OpenFileRequest {
  return exactData(value, []) !== null;
}

export function isSaveFileRequest(value: unknown): value is SaveFileRequest {
  return validSave(value);
}

export function isSaveFileAsRequest(value: unknown): value is SaveFileRequest {
  return validSave(value);
}

export function isOpenRequestsReadyRequest(
  value: unknown,
): value is OpenRequestsReadyRequest {
  return exactData(value, []) !== null;
}

export const fileContracts = {
  openFile: { channel: FILE_CHANNELS.openFile, validate: isOpenFileRequest },
  saveFile: { channel: FILE_CHANNELS.saveFile, validate: isSaveFileRequest },
  saveFileAs: { channel: FILE_CHANNELS.saveFileAs, validate: isSaveFileAsRequest },
  openRequestsReady: {
    channel: FILE_CHANNELS.openRequestsReady,
    validate: isOpenRequestsReadyRequest,
  },
} as const;
