export const SETTINGS_CHANNELS = {
  read: "settings:read",
  write: "settings:write",
} as const;

export interface SettingsReadRequest {}

export interface SettingsReadResponse {
  version: 1;
  theme: "light" | "dark" | "system";
  fontSize: number;
  preview: { scrollSync: boolean; background: string | null };
  editor: { wrap: boolean; tabSize: number; background: string | null };
  encoding: { default: "utf-8"; lineEndings: "lf" | "crlf" | "cr" };
  ignore: string[];
  [key: string]: unknown;
}
export type SettingsWriteRequest = Record<string, unknown>;
export type SettingsWriteResponse = void;

export function isSettingsReadRequest(
  value: unknown,
): value is SettingsReadRequest {
  return typeof value === "object" && value !== null &&
    !Array.isArray(value) && Reflect.ownKeys(value).length === 0;
}

export function isSettingsWriteRequest(
  value: unknown,
): value is SettingsWriteRequest {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const settingsContracts = {
  read: { channel: SETTINGS_CHANNELS.read, validate: isSettingsReadRequest },
  write: { channel: SETTINGS_CHANNELS.write, validate: isSettingsWriteRequest },
} as const;
