export interface ExportPayloadRequest {
  grant: string;
  bytes: Uint8Array;
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  try {
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== keys.length || ownKeys.some((key) =>
      typeof key !== "string" || !keys.includes(key))) {
      return null;
    }
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) {
        return null;
      }
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

export function isExportPayloadRequest(value: unknown): value is ExportPayloadRequest {
  const request = exactObject(value, ["grant", "bytes"]);
  return request !== null && typeof request["grant"] === "string" &&
    request["grant"].length > 0 && request["grant"].length <= 8 * 1024 &&
    request["bytes"] instanceof Uint8Array;
}

export function createExportPayload(grant: string, bytes: Uint8Array): ExportPayloadRequest {
  const request: unknown = { grant, bytes };
  if (!isExportPayloadRequest(request)) {
    throw new Error("Invalid export payload");
  }
  return { grant, bytes: bytes.slice() };
}
