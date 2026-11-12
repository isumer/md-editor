export type ServiceErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "IS_DIRECTORY"
  | "PERMISSION_DENIED"
  | "DISK_FULL"
  | "CONFLICT"
  | "GRANT_INVALID"
  | "WORKER_RESTARTED"
  | "OUT_OF_SYNC"
  | "FORBIDDEN_SENDER"
  | "UNSUPPORTED_SCHEME"
  | "TOO_LARGE"
  | "BINARY_FILE"
  | "UNKNOWN";

export type MessageKey =
  | "request.invalid"
  | "grant.invalid"
  | "file.workerRestarted"
  | "file.outOfSync"
  | "sender.forbidden"
  | "link.invalid"
  | "link.unsupportedScheme"
  | "file.notFound"
  | "file.isDirectory"
  | "file.permissionDenied"
  | "file.diskFull"
  | "file.conflict"
  | "file.nameConflict"
  | "file.tooLarge"
  | "file.binary"
  | "file.unknown";

export interface ServiceError {
  code: ServiceErrorCode;
  messageKey: MessageKey;
  params: Readonly<Record<string, string>>;
  retryable: boolean;
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: ServiceError };

export function serviceError(
  code: ServiceErrorCode,
  messageKey: MessageKey,
  params: Readonly<Record<string, string>> = {},
  retryable = false,
): ServiceError {
  return { code, messageKey, params, retryable };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isServiceError(value: unknown): value is ServiceError {
  return isRecord(value) && typeof value["code"] === "string" &&
    typeof value["messageKey"] === "string" &&
    isRecord(value["params"]) && typeof value["retryable"] === "boolean";
}

function errorCode(value: unknown): string | undefined {
  return isRecord(value) && typeof value["code"] === "string"
    ? value["code"]
    : undefined;
}

function errorReason(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  return typeof value === "string" ? value : "An unexpected error occurred";
}

function knownError(
  code: string | undefined,
  params: Readonly<Record<string, string>>,
): ServiceError | undefined {
  switch (code) {
    case "ENOENT":
    case "ENOTDIR": return serviceError("NOT_FOUND", "file.notFound", params);
    case "EISDIR": return serviceError("IS_DIRECTORY", "file.isDirectory", params);
    case "EACCES":
    case "EPERM":
    case "EROFS": return serviceError("PERMISSION_DENIED", "file.permissionDenied", params);
    case "ENOSPC":
    case "EDQUOT": return serviceError("DISK_FULL", "file.diskFull", params, true);
    case "EEXIST":
    case "EBUSY":
    case "ETXTBSY":
    case "ESTALE": return serviceError("CONFLICT", "file.conflict", params, true);
    case "EFBIG": return serviceError("TOO_LARGE", "file.tooLarge", params);
    default: return undefined;
  }
}

export function toServiceError(
  value: unknown,
  params: Readonly<Record<string, string>> = {},
): ServiceError {
  if (isServiceError(value)) {
    return value;
  }
  const mapped = knownError(errorCode(value), params);
  if (mapped) {
    return mapped;
  }
  return serviceError("UNKNOWN", "file.unknown", {
    ...params,
    reason: errorReason(value),
  });
}

export function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
