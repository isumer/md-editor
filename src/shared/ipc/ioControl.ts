/* eslint-disable max-lines -- Control messages and validators stay together for exhaustive checks. */
export const MAX_CONTROL_PATH_LENGTH = 32 * 1024;
export const MAX_ASSET_RELATIVE_PATH_LENGTH = 32 * 1024;
export const MAX_SESSION_PATH_LENGTH = 32 * 1024;
export const MAX_SESSION_TEXT_LENGTH = 256 * 1024 * 1024;
export const STORED_SESSION_VERSION = 1;

export interface StoredDocument {
  name: string;
  path: string;
  savedText: string;
  text: string;
}

export interface StoredSession {
  documents: StoredDocument[];
  version: typeof STORED_SESSION_VERSION;
}

export interface RegisterGrantRequest {
  type: "registerGrant";
  id: string;
  windowId: number;
  handle: string;
  path: string;
  mustExist: boolean;
}

export interface RevokeGrantRequest {
  type: "revokeGrant";
  windowId: number;
  handle: string;
}

export interface RevokeWindowRequest {
  type: "revokeWindow";
  windowId: number;
}

export interface AttachPortRequest {
  type: "attachPort";
  windowId: number;
}

export interface ResolveAssetRequest {
  type: "resolveAsset";
  id: string;
  windowId: number;
  grant: string;
  relativePath: string;
}

export interface ReadSessionRequest {
  type: "readSession";
  id: string;
  path: string;
}

export interface WriteSessionRequest {
  type: "writeSession";
  id: string;
  path: string;
  session: StoredSession;
}

export interface ReadSettingsRequest {
  type: "readSettings";
  id: string;
  path: string;
}

export interface WriteSettingsRequest {
  type: "writeSettings";
  id: string;
  path: string;
  settings: unknown;
}

export interface WriteExportRequest {
  type: "writeExport";
  id: string;
  windowId: number;
  grant: string;
  bytes: Uint8Array;
}

export type IoControlRequest =
  | RegisterGrantRequest
  | RevokeGrantRequest
  | RevokeWindowRequest
  | AttachPortRequest
  | ResolveAssetRequest
  | ReadSessionRequest
  | WriteSessionRequest
  | ReadSettingsRequest
  | WriteSettingsRequest
  | WriteExportRequest;

export interface RegisteredGrant {
  canonicalPath: string;
  name: string;
}

export interface ResolvedAsset {
  path: string;
}

export interface ControlError {
  code: string;
  messageKey: string;
  params: Readonly<Record<string, string>>;
  retryable: boolean;
}

export interface RegisterGrantReply {
  id: string;
  result:
    | { ok: true; value: RegisteredGrant }
    | { ok: false; error: ControlError };
}

export interface ResolveAssetReply {
  id: string;
  result:
    | { ok: true; value: ResolvedAsset }
    | { ok: false; error: ControlError };
}

export interface SessionReadReply {
  id: string;
  result:
    | { ok: true; value: StoredSession }
    | { ok: false; error: ControlError };
}

export interface SessionWriteReply {
  id: string;
  result:
    | { ok: true; value: Record<string, never> }
    | { ok: false; error: ControlError };
}

export interface SettingsReadReply {
  id: string;
  result:
    | { ok: true; value: unknown }
    | { ok: false; error: ControlError };
}

export interface SettingsWriteReply {
  id: string;
  result:
    | { ok: true; value: Record<string, never> }
    | { ok: false; error: ControlError };
}

export interface ExportWriteReply {
  id: string;
  result:
    | { ok: true; value: Record<string, never> }
    | { ok: false; error: ControlError };
}

function exactData(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
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

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function validWindowId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function validHandle(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 8 * 1024;
}

function isRegister(value: unknown): value is RegisterGrantRequest {
  const request = exactData(
    value,
    ["type", "id", "windowId", "handle", "path", "mustExist"],
  );
  return request !== null && request["type"] === "registerGrant" &&
    validId(request["id"]) && validWindowId(request["windowId"]) &&
    validHandle(request["handle"]) && typeof request["path"] === "string" &&
    request["path"].length > 0 && request["path"].length <= MAX_CONTROL_PATH_LENGTH &&
    typeof request["mustExist"] === "boolean";
}

function isRevokeGrant(value: unknown): value is RevokeGrantRequest {
  const request = exactData(value, ["type", "windowId", "handle"]);
  return request !== null && request["type"] === "revokeGrant" &&
    validWindowId(request["windowId"]) && validHandle(request["handle"]);
}

function isWindowMessage(
  value: unknown,
  type: "revokeWindow" | "attachPort",
): value is RevokeWindowRequest | AttachPortRequest {
  const request = exactData(value, ["type", "windowId"]);
  return request !== null && request["type"] === type &&
    validWindowId(request["windowId"]);
}

function isResolveAsset(value: unknown): value is ResolveAssetRequest {
  const request = exactData(
    value,
    ["type", "id", "windowId", "grant", "relativePath"],
  );
  return request !== null && request["type"] === "resolveAsset" &&
    validId(request["id"]) && validWindowId(request["windowId"]) &&
    validHandle(request["grant"]) &&
    typeof request["relativePath"] === "string" &&
    request["relativePath"].length > 0 &&
    request["relativePath"].length <= MAX_ASSET_RELATIVE_PATH_LENGTH;
}

function validSessionPath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= MAX_SESSION_PATH_LENGTH;
}

function arrayValues(value: unknown): readonly unknown[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  try {
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (typeof length !== "number" || !Number.isSafeInteger(length)) {
      return null;
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1 ||
      keys.some((key) => typeof key !== "string" ||
        (key !== "length" && !Number.isSafeInteger(Number(key))))) {
      return null;
    }
    const values: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor)) {
        return null;
      }
      values.push(descriptor.value);
    }
    return values;
  } catch {
    return null;
  }
}

function validStoredText(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_SESSION_TEXT_LENGTH;
}

export function emptyStoredSession(): StoredSession {
  return { documents: [], version: STORED_SESSION_VERSION };
}

export function parseStoredSession(value: unknown): StoredSession {
  if (typeof value !== "object" || value === null) {
    return emptyStoredSession();
  }
  const record = value as Record<string, unknown>;
  if (record["version"] !== STORED_SESSION_VERSION ||
    !Array.isArray(record["documents"])) {
    return emptyStoredSession();
  }
  return {
    documents: record["documents"].filter((document): document is StoredDocument => {
      if (typeof document !== "object" || document === null) {
        return false;
      }
      const entry = document as Record<string, unknown>;
      return typeof entry["name"] === "string" &&
        typeof entry["path"] === "string" && entry["path"].length > 0 &&
        entry["path"].length <= MAX_SESSION_PATH_LENGTH &&
        validStoredText(entry["savedText"]) && validStoredText(entry["text"]);
    }),
    version: STORED_SESSION_VERSION,
  };
}

function isStoredDocument(value: unknown): value is StoredDocument {
  const document = exactData(value, ["name", "path", "savedText", "text"]);
  return document !== null && typeof document["name"] === "string" &&
    validSessionPath(document["path"]) &&
    validStoredText(document["savedText"]) && validStoredText(document["text"]);
}

export function isStoredSession(value: unknown): value is StoredSession {
  const session = exactData(value, ["documents", "version"]);
  if (session === null || session["version"] !== STORED_SESSION_VERSION) {
    return false;
  }
  const documents = arrayValues(session["documents"]);
  return documents !== null && documents.length <= 512 &&
    documents.every(isStoredDocument);
}

function isReadSession(value: unknown): value is ReadSessionRequest {
  const request = exactData(value, ["type", "id", "path"]);
  return request !== null && request["type"] === "readSession" &&
    validId(request["id"]) && validSessionPath(request["path"]);
}

function isWriteSession(value: unknown): value is WriteSessionRequest {
  const request = exactData(value, ["type", "id", "path", "session"]);
  return request !== null && request["type"] === "writeSession" &&
    validId(request["id"]) && validSessionPath(request["path"]) &&
    isStoredSession(request["session"]);
}

function isReadSettings(value: unknown): value is ReadSettingsRequest {
  const request = exactData(value, ["type", "id", "path"]);
  return request !== null && request["type"] === "readSettings" &&
    validId(request["id"]) && validSessionPath(request["path"]);
}

function isWriteSettings(value: unknown): value is WriteSettingsRequest {
  const request = exactData(value, ["type", "id", "path", "settings"]);
  return request !== null && request["type"] === "writeSettings" &&
    validId(request["id"]) && validSessionPath(request["path"]) &&
    typeof request["settings"] === "object" && request["settings"] !== null &&
    !Array.isArray(request["settings"]);
}

function isWriteExport(value: unknown): value is WriteExportRequest {
  const request = exactData(value, ["type", "id", "windowId", "grant", "bytes"]);
  return request !== null && request["type"] === "writeExport" &&
    validId(request["id"]) && validWindowId(request["windowId"]) &&
    validHandle(request["grant"]) && request["bytes"] instanceof Uint8Array &&
    request["bytes"].byteLength <= MAX_SESSION_TEXT_LENGTH;
}

export function isIoControlRequest(value: unknown): value is IoControlRequest {
  return isRegister(value) || isRevokeGrant(value) ||
    isWindowMessage(value, "revokeWindow") || isWindowMessage(value, "attachPort") ||
    isResolveAsset(value) || isReadSession(value) || isWriteSession(value) ||
    isReadSettings(value) || isWriteSettings(value) || isWriteExport(value);
}

export function controlRequestId(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, "id");
    return descriptor && "value" in descriptor && validId(descriptor.value)
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

function validParams(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    return Reflect.ownKeys(value).every((key) => {
      const descriptor = typeof key === "string"
        ? Object.getOwnPropertyDescriptor(value, key)
        : undefined;
      return descriptor !== undefined && "value" in descriptor &&
        typeof descriptor.value === "string";
    });
  } catch {
    return false;
  }
}

function validError(value: unknown): boolean {
  const error = exactData(value, ["code", "messageKey", "params", "retryable"]);
  return error !== null && typeof error["code"] === "string" &&
    typeof error["messageKey"] === "string" && validParams(error["params"]) &&
    typeof error["retryable"] === "boolean";
}

function validRegisteredGrant(value: unknown): boolean {
  const grant = exactData(value, ["canonicalPath", "name"]);
  return grant !== null && typeof grant["canonicalPath"] === "string" &&
    typeof grant["name"] === "string";
}

function validResolvedAsset(value: unknown): boolean {
  const asset = exactData(value, ["path"]);
  return asset !== null && typeof asset["path"] === "string" &&
    asset["path"].length > 0;
}

function validResult(
  value: unknown,
  validValue: (candidate: unknown) => boolean,
): boolean {
  const success = exactData(value, ["ok", "value"]);
  if (success && success["ok"] === true) {
    return validValue(success["value"]);
  }
  const failure = exactData(value, ["ok", "error"]);
  return failure !== null && failure["ok"] === false && validError(failure["error"]);
}

export function isRegisterGrantReply(value: unknown): value is RegisterGrantReply {
  const reply = exactData(value, ["id", "result"]);
  return reply !== null && validId(reply["id"]) &&
    validResult(reply["result"], validRegisteredGrant);
}

export function isResolveAssetReply(value: unknown): value is ResolveAssetReply {
  const reply = exactData(value, ["id", "result"]);
  return reply !== null && validId(reply["id"]) &&
    validResult(reply["result"], validResolvedAsset);
}

export function isSessionReadReply(value: unknown): value is SessionReadReply {
  const reply = exactData(value, ["id", "result"]);
  return reply !== null && validId(reply["id"]) &&
    validResult(reply["result"], isStoredSession);
}

export function isSessionWriteReply(value: unknown): value is SessionWriteReply {
  const reply = exactData(value, ["id", "result"]);
  return reply !== null && validId(reply["id"]) &&
    validResult(reply["result"], (candidate) => exactData(candidate, []) !== null);
}

export function isSettingsReadReply(value: unknown): value is SettingsReadReply {
  const reply = exactData(value, ["id", "result"]);
  return reply !== null && validId(reply["id"]) &&
    validResult(reply["result"], (candidate) => typeof candidate === "object" && candidate !== null);
}

export function isSettingsWriteReply(value: unknown): value is SettingsWriteReply {
  const reply = exactData(value, ["id", "result"]);
  return reply !== null && validId(reply["id"]) &&
    validResult(reply["result"], (candidate) => exactData(candidate, []) !== null);
}

export function isExportWriteReply(value: unknown): value is ExportWriteReply {
  const reply = exactData(value, ["id", "result"]);
  return reply !== null && validId(reply["id"]) &&
    validResult(reply["result"], (candidate) => exactData(candidate, []) !== null);
}
