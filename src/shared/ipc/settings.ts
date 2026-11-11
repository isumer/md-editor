import type { Settings } from "../settings/settings";

export const SETTINGS_CHANNELS = {
  read: "settings:read",
  write: "settings:write",
} as const;

export interface SettingsReadRequest {}

export type SettingsReadResponse = Settings;
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
