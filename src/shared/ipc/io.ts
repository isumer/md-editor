export const IO_PORT_CHANNEL = "io:port";
export const MAX_IO_TEXT_LENGTH = 256 * 1024 * 1024;
export const MAX_IO_GRANT_LENGTH = 8 * 1024;

export interface ReadDocumentRequest {
  id: string;
  op: "read";
  grant: string;
}

export interface WriteDocumentRequest {
  id: string;
  op: "write";
  grant: string;
  text: string;
}

export type IoRequest = ReadDocumentRequest | WriteDocumentRequest;

export interface ReadDocumentResponse {
  name: string;
  text: string;
}

export interface WriteDocumentResponse {
  name: string;
}

export interface BoundaryError {
  code: string;
  messageKey: string;
  params: Readonly<Record<string, string>>;
  retryable: boolean;
}

export type BoundaryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: BoundaryError };

export interface IoReply {
  id: string;
  result: BoundaryResult<ReadDocumentResponse | WriteDocumentResponse>;
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

function validGrant(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= MAX_IO_GRANT_LENGTH;
}

export function ioRequestId(value: unknown): string | null {
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

export function isIoRequest(value: unknown): value is IoRequest {
  const read = exactData(value, ["id", "op", "grant"]);
  if (read && validId(read["id"]) && read["op"] === "read" &&
    validGrant(read["grant"])) {
    return true;
  }
  const write = exactData(value, ["id", "op", "grant", "text"]);
  return write !== null && validId(write["id"]) && write["op"] === "write" &&
    validGrant(write["grant"]) && typeof write["text"] === "string" &&
    write["text"].length <= MAX_IO_TEXT_LENGTH;
}

function validParams(value: unknown): value is Readonly<Record<string, string>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    return Reflect.ownKeys(value).every((key) => {
      if (typeof key !== "string") {
        return false;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && "value" in descriptor &&
        typeof descriptor.value === "string";
    });
  } catch {
    return false;
  }
}

function validError(value: unknown): value is BoundaryError {
  const error = exactData(value, ["code", "messageKey", "params", "retryable"]);
  return error !== null && typeof error["code"] === "string" &&
    typeof error["messageKey"] === "string" && validParams(error["params"]) &&
    typeof error["retryable"] === "boolean";
}

function validSuccessValue(value: unknown): boolean {
  const write = exactData(value, ["name"]);
  if (write && typeof write["name"] === "string") {
    return true;
  }
  const read = exactData(value, ["name", "text"]);
  return read !== null && typeof read["name"] === "string" &&
    typeof read["text"] === "string";
}

function validResult(value: unknown): boolean {
  const success = exactData(value, ["ok", "value"]);
  if (success && success["ok"] === true) {
    return validSuccessValue(success["value"]);
  }
  const failure = exactData(value, ["ok", "error"]);
  return failure !== null && failure["ok"] === false && validError(failure["error"]);
}

export function isIoReply(value: unknown): value is IoReply {
  const reply = exactData(value, ["id", "result"]);
  return reply !== null && validId(reply["id"]) && validResult(reply["result"]);
}
