import type { Result } from "../../shared/ipc/result";
import type { Settings } from "../../shared/settings/settings";
import { normalizeSettings, DEFAULT_SETTINGS } from "../../shared/settings/settings";

export interface SettingsControl {
  readSettings(filePath: string): Promise<Result<unknown>>;
  writeSettings(filePath: string, settings: Settings): Promise<Result<void>>;
}

export class SettingsStore {
  constructor(
    private readonly filePath: string,
    private readonly control: SettingsControl,
  ) {}

  async read(): Promise<Settings> {
    const result = await this.control.readSettings(this.filePath);
    if (!result.ok) {
      return DEFAULT_SETTINGS;
    }
    return normalizeSettings(result.value);
  }

  async write(settings: Settings): Promise<void> {
    const result = await this.control.writeSettings(this.filePath, settings);
    if (!result.ok) {
      throw result.error;
    }
  }
}
