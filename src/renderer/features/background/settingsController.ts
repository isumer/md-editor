import type { Result, ServiceError } from "../../../shared/ipc/result";
import type {
  SettingsReadResponse,
  SettingsWriteRequest,
  SettingsWriteResponse,
} from "../../../shared/ipc/settings";
import { normalizeSettings } from "../../../shared/settings/settings";
import { formatMessage } from "../../core/messages";
import {
  applyBackgrounds,
  resolveSystemTheme,
  watchSystemTheme,
  type ResolvedTheme,
} from "./background";
import {
  installBackgroundSettingsDialog,
  type BackgroundSettingsDialog,
} from "./settingsDialog";

export interface BackgroundSettingsDependencies {
  load(): Promise<Result<SettingsReadResponse>>;
  save(settings: SettingsWriteRequest): Promise<Result<SettingsWriteResponse>>;
  reportError(message: string): void;
}

export interface BackgroundSettingsController {
  dispose(): void;
  flush(): Promise<void>;
  start(): Promise<void>;
}

function defaultSettings(): SettingsReadResponse {
  return normalizeSettings({});
}

function settingsError(error: ServiceError): string {
  return formatMessage(error.messageKey, { file: "settings", ...error.params });
}

function copySettings(settings: SettingsReadResponse): SettingsReadResponse {
  return {
    ...settings,
    editor: { ...settings.editor },
    preview: { ...settings.preview },
    encoding: { ...settings.encoding },
    ignore: [...settings.ignore],
  };
}

class Controller implements BackgroundSettingsController {
  private settings = defaultSettings();
  private dialog: BackgroundSettingsDialog | null = null;
  private stopThemeWatch: (() => void) | null = null;
  private pendingSave: SettingsReadResponse | null = null;
  private saveTask: Promise<void> | null = null;

  constructor(private readonly dependencies: BackgroundSettingsDependencies) {}

  async start(): Promise<void> {
    const result = await this.dependencies.load();
    if (result.ok) {
      this.settings = copySettings(result.value);
    } else {
      this.dependencies.reportError(settingsError(result.error));
    }
    this.dialog = installBackgroundSettingsDialog({
      changeBackground: (pane, value) => this.changeBackground(pane, value),
      changeTheme: (theme) => this.changeTheme(theme),
      resetBackground: (pane) => this.resetBackground(pane),
    });
    this.stopThemeWatch = watchSystemTheme(() => {
      if (this.settings.theme === "system") this.apply();
    });
    this.apply();
  }

  dispose(): void {
    this.stopThemeWatch?.();
    this.stopThemeWatch = null;
    this.dialog?.dispose();
    this.dialog = null;
  }

  async flush(): Promise<void> {
    await this.saveTask;
  }

  private resolvedTheme(): ResolvedTheme {
    return this.settings.theme === "system"
      ? resolveSystemTheme()
      : this.settings.theme;
  }

  private apply(): void {
    const theme = this.resolvedTheme();
    if (this.settings.theme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.dataset["theme"] = theme;
    }
    applyBackgrounds({
      editor: this.settings.editor.background,
      preview: this.settings.preview.background,
    }, theme);
    this.dialog?.update(this.settings, theme);
  }

  private changeBackground(pane: "editor" | "preview", value: string): void {
    this.settings = pane === "editor"
      ? { ...this.settings, editor: { ...this.settings.editor, background: value } }
      : { ...this.settings, preview: { ...this.settings.preview, background: value } };
    this.changed();
  }

  private resetBackground(pane: "editor" | "preview"): void {
    this.settings = pane === "editor"
      ? { ...this.settings, editor: { ...this.settings.editor, background: null } }
      : { ...this.settings, preview: { ...this.settings.preview, background: null } };
    this.changed();
  }

  private changeTheme(theme: "light" | "dark" | "system"): void {
    this.settings = { ...this.settings, theme };
    this.changed();
  }

  private changed(): void {
    this.apply();
    this.pendingSave = copySettings(this.settings);
    if (this.saveTask === null) this.saveTask = this.flushSaves();
  }

  private async flushSaves(): Promise<void> {
    while (this.pendingSave !== null) {
      const settings = this.pendingSave;
      this.pendingSave = null;
      const result = await this.dependencies.save(settings);
      if (!result.ok) this.dependencies.reportError(settingsError(result.error));
    }
    this.saveTask = null;
  }
}

export function createBackgroundSettingsController(
  dependencies: BackgroundSettingsDependencies,
): BackgroundSettingsController {
  return new Controller(dependencies);
}
