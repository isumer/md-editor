export const MAX_CONTROL_PATH_LENGTH = 32 * 1024;
export const MAX_ASSET_RELATIVE_PATH_LENGTH = 32 * 1024;

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

export type IoControlRequest =
  | RegisterGrantRequest
  | RevokeGrantRequest
  | RevokeWindowRequest
  | AttachPortRequest
  | ResolveAssetRequest;

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

export function isIoControlRequest(value: unknown): value is IoControlRequest {
  return isRegister(value) || isRevokeGrant(value) ||
    isWindowMessage(value, "revokeWindow") || isWindowMessage(value, "attachPort") ||
    isResolveAsset(value);
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
