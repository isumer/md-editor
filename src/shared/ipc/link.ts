export const MAX_URL_LENGTH = 8 * 1024;

export const LINK_CHANNELS = {
  openExternal: "link:open-external",
} as const;

export interface OpenExternalRequest {
  url: string;
}

export type OpenExternalResponse = void;

function exactUrl(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  try {
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 1 || keys[0] !== "url") {
      return null;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, "url");
    return descriptor && "value" in descriptor && typeof descriptor.value === "string"
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

export function isOpenExternalRequest(value: unknown): value is OpenExternalRequest {
  const url = exactUrl(value);
  return url !== null && url.length <= MAX_URL_LENGTH;
}

export const linkContracts = {
  openExternal: {
    channel: LINK_CHANNELS.openExternal,
    validate: isOpenExternalRequest,
  },
} as const;
