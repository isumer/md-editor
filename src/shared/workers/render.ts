export const MAX_RENDER_TEXT_LENGTH = 256 * 1024 * 1024;

export type RenderChangeSetJsonPart = number | readonly [number, ...string[]];
export type RenderChangeSetJson = readonly RenderChangeSetJsonPart[];

export interface RenderAttachMessage {
  op: "attach";
  docId: string;
  epoch: number;
  version: number;
  text: string;
}

export interface RenderChangeMessage {
  op: "change";
  docId: string;
  epoch: number;
  fromVersion: number;
  toVersion: number;
  changes: RenderChangeSetJson;
}

export interface RenderRequest {
  op: "render";
  id: number;
  docId: string;
  epoch: number;
  version: number;
}

// Shows the worker's cached blocks for a document without parsing it again.
export interface RenderShowMessage {
  op: "show";
  id: number;
  docId: string;
  epoch: number;
  version: number;
}

export interface RenderDetachMessage {
  op: "detach";
  docId: string;
}

// Drops the cached incremental render so the next request rebuilds the preview
// from the mirror. Used when a tab becomes active again.
export interface RenderResetMessage {
  op: "reset";
  docId: string;
}

export interface RenderPingMessage {
  op: "ping";
  id: number;
}

// The preview has applied one fill batch and is ready for the next. The worker
// keeps at most one batch in flight so the main thread can stay responsive.
export interface RenderFillReadyMessage {
  op: "fill-ready";
  docId: string;
  epoch: number;
  version: number;
  token: number;
}

export interface RenderPongMessage {
  op: "pong";
  id: number;
}

export type RenderWorkerRequest =
  | RenderAttachMessage
  | RenderChangeMessage
  | RenderRequest
  | RenderShowMessage
  | RenderDetachMessage
  | RenderFillReadyMessage
  | RenderResetMessage
  | RenderPingMessage;

interface RenderResultVersion {
  id: number;
  docId: string;
  epoch: number;
  version: number;
}

export interface RenderBlock {
  id: string;
  startLine: number;
  endLine: number;
  html: string;
}

export interface RenderBlockPatch {
  block: RenderBlock;
  after: string | null;
}

// Blocks after `after` (or all blocks when null) moved by `delta` lines. Kept
// out of band so a line-count change does not require re-sending unchanged
// blocks or rewriting every block's DOM.
export interface RenderLineShift {
  after: string | null;
  delta: number;
}

export type RenderResult =
  | (RenderResultVersion & {
    ok: true;
    mode: "replace";
    blocks: readonly RenderBlock[];
    complete: boolean;
    cached?: boolean;
  })
  | (RenderResultVersion & {
    ok: true;
    mode: "append";
    blocks: readonly RenderBlock[];
    fillToken: number;
    complete: boolean;
  })
  | (RenderResultVersion & {
    ok: true;
    mode: "patch";
    blocks: readonly RenderBlockPatch[];
    removed: readonly string[];
    lineShifts?: readonly RenderLineShift[];
    complete: boolean;
  })
  | (RenderResultVersion & { ok: false; message: string });

export interface RenderResync extends RenderResultVersion {
  op: "resync";
}

export type RenderResponse = RenderResult | RenderResync | RenderPongMessage;

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
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
    const keys = Reflect.ownKeys(value);
    if (typeof length !== "number" || keys.length !== length + 1 ||
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

function validVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validDocId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
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
    if (!Number.isSafeInteger(length) || length > MAX_RENDER_TEXT_LENGTH) {
      return null;
    }
  }
  return length;
}

function validChanges(value: unknown): value is RenderChangeSetJson {
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
    if (!Number.isSafeInteger(totalInserted) || totalInserted > MAX_RENDER_TEXT_LENGTH) {
      return false;
    }
  }
  return true;
}

function validAttach(value: unknown): value is RenderAttachMessage {
  const data = exactData(value, ["op", "docId", "epoch", "version", "text"]);
  return data !== null && data["op"] === "attach" &&
    validDocId(data["docId"]) && validVersion(data["epoch"]) &&
    validVersion(data["version"]) && typeof data["text"] === "string" &&
    data["text"].length <= MAX_RENDER_TEXT_LENGTH;
}

function validChange(value: unknown): value is RenderChangeMessage {
  const data = exactData(
    value,
    ["op", "docId", "epoch", "fromVersion", "toVersion", "changes"],
  );
  return data !== null && data["op"] === "change" &&
    validDocId(data["docId"]) && validVersion(data["epoch"]) &&
    validVersion(data["fromVersion"]) && validVersion(data["toVersion"]) &&
    data["toVersion"] === data["fromVersion"] + 1 && validChanges(data["changes"]);
}

function validRender(value: unknown): value is RenderRequest {
  const data = exactData(value, ["op", "id", "docId", "epoch", "version"]);
  return data !== null && data["op"] === "render" && validVersion(data["id"]) &&
    validDocId(data["docId"]) && validVersion(data["epoch"]) &&
    validVersion(data["version"]);
}

function validShow(value: unknown): value is RenderShowMessage {
  const data = exactData(value, ["op", "id", "docId", "epoch", "version"]);
  return data !== null && data["op"] === "show" && validVersion(data["id"]) &&
    validDocId(data["docId"]) && validVersion(data["epoch"]) &&
    validVersion(data["version"]);
}

function validDetach(value: unknown): value is RenderDetachMessage {
  const data = exactData(value, ["op", "docId"]);
  return data !== null && data["op"] === "detach" && validDocId(data["docId"]);
}

function validFillReady(value: unknown): value is RenderFillReadyMessage {
  const data = exactData(
    value,
    ["op", "docId", "epoch", "version", "token"],
  );
  return data !== null && data["op"] === "fill-ready" &&
    validDocId(data["docId"]) && validVersion(data["epoch"]) &&
    validVersion(data["version"]) && validVersion(data["token"]);
}

function validReset(value: unknown): value is RenderResetMessage {
  const data = exactData(value, ["op", "docId"]);
  return data !== null && data["op"] === "reset" && validDocId(data["docId"]);
}

function validPing(value: unknown): value is RenderPingMessage {
  const data = exactData(value, ["op", "id"]);
  return data !== null && data["op"] === "ping" && validVersion(data["id"]);
}

export function isRenderWorkerRequest(value: unknown): value is RenderWorkerRequest {
  return validAttach(value) || validChange(value) || validRender(value) ||
    validShow(value) || validDetach(value) || validFillReady(value) ||
    validReset(value) || validPing(value);
}
