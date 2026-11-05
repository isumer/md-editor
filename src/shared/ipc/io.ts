export const IO_PORT_CHANNEL = "io:port";
export const MAX_IO_TEXT_LENGTH = 256 * 1024 * 1024;
export const MAX_IO_GRANT_LENGTH = 8 * 1024;

export type ChangeSetJsonPart = number | readonly [number, ...string[]];
export type ChangeSetJson = readonly ChangeSetJsonPart[];

export interface ReadDocumentRequest {
  id: string;
  op: "read";
  grant: string;
}

export interface AttachDocumentInput {
  docId: string;
  epoch: number;
  version: number;
  text: string;
}

export interface AttachDocumentRequest extends AttachDocumentInput {
  id: string;
  op: "attach";
}

export interface SaveDocumentInput {
  grant: string;
  docId: string;
  epoch: number;
  version: number;
}

export interface SaveDocumentRequest extends SaveDocumentInput {
  id: string;
  op: "save";
}

export interface ChangeDocumentMessage {
  op: "change";
  docId: string;
  epoch: number;
  fromVersion: number;
  toVersion: number;
  changes: ChangeSetJson;
}

export interface DetachDocumentMessage {
  op: "detach";
  docId: string;
}

export type IoRequest =
  | ReadDocumentRequest
  | AttachDocumentRequest
  | SaveDocumentRequest;
export type IoOneWayMessage = ChangeDocumentMessage | DetachDocumentMessage;

export interface ReadDocumentResponse {
  name: string;
  text: string;
}

export interface SaveDocumentResponse {
  name: string;
  version: number;
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

type IoResponse = ReadDocumentResponse | SaveDocumentResponse | Record<string, never>;

export interface IoReply {
  id: string;
  result: BoundaryResult<IoResponse>;
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

function arrayValues(value: unknown): readonly unknown[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  try {
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !("value" in lengthDescriptor) ||
      typeof lengthDescriptor.value !== "number") {
      return null;
    }
    const length = lengthDescriptor.value;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1 || keys.some((key) =>
      typeof key !== "string" ||
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

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function validDocId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function validGrant(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= MAX_IO_GRANT_LENGTH;
}

function validVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function insertedLength(part: readonly unknown[]): number | null {
  if (part.length === 0 || !validVersion(part[0])) {
    return null;
  }
  let length = 0;
  for (let index = 1; index < part.length; index += 1) {
    const line = part[index];
    if (typeof line !== "string") {
      return null;
    }
    length += line.length + (index > 1 ? 1 : 0);
    if (!Number.isSafeInteger(length) || length > MAX_IO_TEXT_LENGTH) {
      return null;
    }
  }
  return length;
}

function validChanges(value: unknown): value is ChangeSetJson {
  const parts = arrayValues(value);
  if (!parts) {
    return false;
  }
  let totalInserted = 0;
  for (const part of parts) {
    if (validVersion(part)) {
      continue;
    }
    const tuple = arrayValues(part);
    const inserted = tuple ? insertedLength(tuple) : null;
    if (inserted === null) {
      return false;
    }
    totalInserted += inserted;
    if (!Number.isSafeInteger(totalInserted) || totalInserted > MAX_IO_TEXT_LENGTH) {
      return false;
    }
  }
  return true;
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

export function ioMessageOperation(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, "op");
    return descriptor && "value" in descriptor && typeof descriptor.value === "string"
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

function validRead(value: unknown): value is ReadDocumentRequest {
  const data = exactData(value, ["id", "op", "grant"]);
  return data !== null && validId(data["id"]) && data["op"] === "read" &&
    validGrant(data["grant"]);
}

function validAttach(value: unknown): value is AttachDocumentRequest {
  const data = exactData(value, ["id", "op", "docId", "epoch", "version", "text"]);
  return data !== null && validId(data["id"]) && data["op"] === "attach" &&
    validDocId(data["docId"]) && validVersion(data["epoch"]) &&
    validVersion(data["version"]) && typeof data["text"] === "string" &&
    data["text"].length <= MAX_IO_TEXT_LENGTH;
}

function validSave(value: unknown): value is SaveDocumentRequest {
  const data = exactData(
    value,
    ["id", "op", "grant", "docId", "epoch", "version"],
  );
  return data !== null && validId(data["id"]) && data["op"] === "save" &&
    validGrant(data["grant"]) && validDocId(data["docId"]) &&
    validVersion(data["epoch"]) && validVersion(data["version"]);
}

export function isIoRequest(value: unknown): value is IoRequest {
  return validRead(value) || validAttach(value) || validSave(value);
}

export function isIoOneWayMessage(value: unknown): value is IoOneWayMessage {
  const detach = exactData(value, ["op", "docId"]);
  if (detach && detach["op"] === "detach" && validDocId(detach["docId"])) {
    return true;
  }
  const change = exactData(
    value,
    ["op", "docId", "epoch", "fromVersion", "toVersion", "changes"],
  );
  return change !== null && change["op"] === "change" &&
    validDocId(change["docId"]) && validVersion(change["epoch"]) &&
    validVersion(change["fromVersion"]) && validVersion(change["toVersion"]) &&
    change["toVersion"] === change["fromVersion"] + 1 &&
    validChanges(change["changes"]);
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
  const empty = exactData(value, []);
  if (empty) {
    return true;
  }
  const read = exactData(value, ["name", "text"]);
  if (read && typeof read["name"] === "string" && typeof read["text"] === "string") {
    return true;
  }
  const save = exactData(value, ["name", "version"]);
  return save !== null && typeof save["name"] === "string" &&
    validVersion(save["version"]);
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
