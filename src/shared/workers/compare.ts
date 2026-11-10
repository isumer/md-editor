export const MAX_COMPARE_TEXT_LENGTH = 256 * 1024 * 1024;

export type HighlightMode = "words" | "characters" | "lines" | "none";
export type CompareRowKind = "unchanged" | "added" | "deleted" | "modified";
export type CompareSpanKind = "same" | "changed";

export interface CompareSpan {
  readonly kind: CompareSpanKind;
  readonly text: string;
}

export interface CompareSide {
  readonly lineNumber: number;
  readonly text: string;
  readonly spans: readonly CompareSpan[];
}

export interface CompareRow {
  readonly kind: CompareRowKind;
  readonly changeIndex: number | null;
  readonly left?: CompareSide;
  readonly right?: CompareSide;
}

export interface CompareState {
  readonly rows: readonly CompareRow[];
  readonly changeCount: number;
  readonly selectedChange: number;
  readonly highlight: HighlightMode;
  readonly limited: boolean;
}

export interface CompareWorkerRequest {
  readonly id: number;
  readonly left: string;
  readonly right: string;
  readonly highlight: HighlightMode;
}

export type CompareWorkerResponse =
  | { readonly id: number; readonly ok: true; readonly state: CompareState }
  | { readonly id: number; readonly ok: false; readonly message: string };

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

function validId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validText(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_COMPARE_TEXT_LENGTH;
}

function validHighlight(value: unknown): value is HighlightMode {
  return value === "words" || value === "characters" ||
    value === "lines" || value === "none";
}

export function isCompareWorkerRequest(value: unknown): value is CompareWorkerRequest {
  const data = exactData(value, ["id", "left", "right", "highlight"]);
  return data !== null && validId(data["id"]) && validText(data["left"]) &&
    validText(data["right"]) && validHighlight(data["highlight"]);
}
