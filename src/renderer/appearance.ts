import { formatMessage } from "./core/messages";
import {
  applyBackgrounds,
  resolveSystemTheme,
  watchSystemTheme,
} from "./features/background/background";
import { applyFontSize } from "./features/theme/fontSize";
import {
  SettingsController,
  type SettingsBoundary,
} from "./features/theme/settingsController";
import { applyTheme } from "./features/theme/theme";

export function createAppearanceController(
  boundary: SettingsBoundary,
): SettingsController {
  return new SettingsController(boundary, {
    systemTheme: resolveSystemTheme,
    apply: (theme, settings) => {
      applyTheme(theme);
      applyBackgrounds(
        {
          editor: settings.editor.background,
          preview: settings.preview.background,
        },
        theme,
      );
      applyFontSize(settings.fontSize);
    },
    watchSystem: watchSystemTheme,
  });
}

export function applyFontSizeChange(
  controller: SettingsController,
  delta: number,
  showStatus: (message: string) => void,
  onError: (error: unknown) => void,
): void {
  void controller.changeFontSize(delta).then((result) => {
    if (!result.ok) {
      showStatus(formatMessage(result.error.messageKey, result.error.params));
    }
  }).catch(onError);
}
