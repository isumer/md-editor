export const SESSION_CHANNELS = {
  load: "session:load",
  requestClose: "session:request-close",
  closeResult: "session:close-result",
} as const;

export const MAX_SESSION_TEXT_LENGTH = 256 * 1024 * 1024;

export interface SessionLoadRequest {}

export interface SessionDocument {
  grant: string;
  name: string;
  savedText: string;
  text: string;
}

export interface SessionLoadResponse {
  documents: readonly SessionDocument[];
}

export interface SessionCloseRequest {
  id: number;
}

export interface SessionCloseResult {
  allow: boolean;
  documents: readonly SessionDocument[];
  id: number;
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

function validText(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_SESSION_TEXT_LENGTH;
}

function validDocument(value: unknown): value is SessionDocument {
  const document = exactData(value, ["grant", "name", "savedText", "text"]);
  return document !== null && typeof document["grant"] === "string" &&
    document["grant"].length > 0 && document["grant"].length <= 8 * 1024 &&
    typeof document["name"] === "string" && document["name"].length <= 1024 &&
    validText(document["savedText"]) && validText(document["text"]);
}

export function isSessionLoadRequest(value: unknown): value is SessionLoadRequest {
  return exactData(value, []) !== null;
}

export function isSessionCloseResult(value: unknown): value is SessionCloseResult {
  const result = exactData(value, ["allow", "documents", "id"]);
  if (result === null || typeof result["allow"] !== "boolean" ||
    typeof result["id"] !== "number" || !Number.isSafeInteger(result["id"]) ||
    result["id"] < 1) {
    return false;
  }
  const documents = arrayValues(result["documents"]);
  return documents !== null && documents.length <= 512 &&
    documents.every(validDocument);
}

export const sessionContracts = {
  load: { channel: SESSION_CHANNELS.load, validate: isSessionLoadRequest },
  closeResult: {
    channel: SESSION_CHANNELS.closeResult,
    validate: isSessionCloseResult,
  },
} as const;
