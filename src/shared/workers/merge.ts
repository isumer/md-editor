export const MAX_MERGE_TEXT_LENGTH = 256 * 1024 * 1024;

export interface MergeWorkerChunk {
  readonly kind: "change" | "conflict";
  readonly start: number;
  readonly end: number;
  readonly left: string;
  readonly right: string;
}

export interface MergeWorkerRequest {
  readonly id: number;
  readonly base: string;
  readonly left: string;
  readonly right: string;
}

export interface MergeWorkerResult {
  readonly base: string;
  readonly chunks: readonly MergeWorkerChunk[];
  readonly conflictCount: number;
  readonly left: string;
  readonly right: string;
}

export type MergeWorkerResponse =
  | { readonly id: number; readonly ok: true; readonly result: MergeWorkerResult }
  | { readonly id: number; readonly ok: false; readonly message: string };

function exactData(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  try {
    const keys = ["id", "base", "left", "right"];
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== keys.length ||
      ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))) return null;
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

function validText(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.length <= maximumLength;
}

export function isMergeWorkerRequest(
  value: unknown,
  maximumTextLength = MAX_MERGE_TEXT_LENGTH,
): value is MergeWorkerRequest {
  const data = exactData(value);
  return data !== null && typeof data["id"] === "number" &&
    Number.isSafeInteger(data["id"]) && data["id"] >= 0 &&
    validText(data["base"], maximumTextLength) &&
    validText(data["left"], maximumTextLength) &&
    validText(data["right"], maximumTextLength);
}
