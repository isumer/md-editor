import { handle } from "./handle";
import { settingsContracts } from "../../shared/ipc/settings";
import type { Settings } from "../../shared/settings/settings";
import { normalizeSettings } from "../../shared/settings/settings";

interface SettingsStore {
  read(): Promise<Settings>;
  write(settings: Settings): Promise<void>;
}

export function registerSettingsIpcHandler(store: SettingsStore): void {
  handle(settingsContracts.read, async () => {
    return store.read();
  });
  handle(settingsContracts.write, async (settings) => {
    const normalized = normalizeSettings(settings);
    await store.write(normalized);
  });
}
