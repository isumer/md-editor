import { handle } from "./handle";
import type { Settings } from "../../shared/settings/settings";
import { normalizeSettings } from "../../shared/settings/settings";

function isEmptyObject(value: unknown): value is Record<string, never> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;
}

function isSettingsObject(value: unknown): value is Settings {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function registerSettingsIpcHandler(store: { read: () => Promise<Settings>; write: (settings: Settings) => Promise<void> }): void {
  handle({ channel: "settings:read", validate: isEmptyObject }, async () => {
    const settings = await store.read();
    return { ok: true, value: settings };
  });
  handle({ channel: "settings:write", validate: isSettingsObject }, async (settings: Settings) => {
    const normalized = normalizeSettings(settings);
    await store.write(normalized);
    return { ok: true, value: {} };
  });
}