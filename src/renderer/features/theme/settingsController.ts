import type { Result } from "../../../shared/ipc/result";
import type {
  SettingsReadResponse,
  SettingsWriteRequest,
  SettingsWriteResponse,
} from "../../../shared/ipc/settings";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type Settings,
} from "../../../shared/settings/settings";
import { applyFontSize, changeFontSize } from "./fontSize";
import { resolveTheme, type ResolvedTheme } from "./theme";

export interface SettingsBoundary {
  load(): Promise<Result<SettingsReadResponse>>;
  save(settings: SettingsWriteRequest): Promise<Result<SettingsWriteResponse>>;
}

export interface Appearance {
  systemTheme(): ResolvedTheme;
  apply(theme: ResolvedTheme, settings: Settings): void;
  watchSystem(onChange: (theme: ResolvedTheme) => void): () => void;
}

export class SettingsController {
  private settings: Settings = normalizeSettings(DEFAULT_SETTINGS);
  private stopWatching: (() => void) | null = null;
  private saving: Promise<Result<SettingsWriteResponse>> = Promise.resolve({
    ok: true,
    value: undefined,
  });

  constructor(
    private readonly boundary: SettingsBoundary,
    private readonly appearance: Appearance,
  ) {}

  current(): Settings {
    return this.settings;
  }

  apply(): void {
    const resolved = resolveTheme(
      this.settings.theme,
      this.appearance.systemTheme(),
    );
    this.appearance.apply(resolved, this.settings);
    this.watchSystem();
  }

  async load(): Promise<void> {
    try {
      const result = await this.boundary.load();
      if (result.ok) {
        this.settings = normalizeSettings(result.value);
      }
    } catch {
      // A settings read must never stop startup; the defaults stay applied.
    }
    this.apply();
  }

  changeFontSize(delta: number): Promise<Result<SettingsWriteResponse>> {
    const next = changeFontSize(this.settings.fontSize, delta);
    if (next === this.settings.fontSize) {
      return Promise.resolve({ ok: true, value: undefined });
    }
    this.settings = { ...this.settings, fontSize: next };
    applyFontSize(next);
    return this.save();
  }

  private save(): Promise<Result<SettingsWriteResponse>> {
    const previous = this.saving.catch(() => ({
      ok: true as const,
      value: undefined,
    }));
    this.saving = previous.then(() => this.boundary.save(this.settings));
    return this.saving;
  }

  private watchSystem(): void {
    if (this.settings.theme === "system") {
      if (this.stopWatching === null) {
        this.stopWatching = this.appearance.watchSystem(() => this.apply());
      }
      return;
    }
    if (this.stopWatching !== null) {
      this.stopWatching();
      this.stopWatching = null;
    }
  }
}
