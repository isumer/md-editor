import { parseHexColor, contrastRatio, textColorFor, formatHexColor, type Rgb } from "../../../shared/settings/appearance";

export interface BackgroundSettings {
  editor: string | null;
  preview: string | null;
}

export type ResolvedTheme = "light" | "dark";

const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

const EDITOR_SELECTOR = "#editor .cm-editor";
const PREVIEW_SELECTOR = "#preview";

function resolveColor(custom: string | null, themeDefault: string): { color: string; isCustom: boolean } {
  const parsed = parseHexColor(custom);
  if (parsed !== null) {
    return { color: formatHexColor(parsed), isCustom: true };
  }
  return { color: themeDefault, isCustom: false };
}

function getThemeDefaults(theme: "light" | "dark"): { editor: string; preview: string; text: string } {
  if (theme === "dark") {
    return { editor: "#0d1117", preview: "#0d1117", text: "#e6edf3" };
  }
  return { editor: "#ffffff", preview: "#ffffff", text: "#1f2328" };
}

function getContrastTextColor(background: string, theme: "light" | "dark", isCustom: boolean): string {
  if (!isCustom) {
    return getThemeDefaults(theme).text;
  }
  const parsed = parseHexColor(background);
  if (parsed === null) {
    return getThemeDefaults(theme).text;
  }
  return textColorFor(parsed);
}

function applyBackground(
  element: HTMLElement | null,
  background: string,
  textColor: string,
): void {
  if (!element) return;
  element.style.setProperty("--custom-background", background);
  element.style.setProperty("--custom-text-color", textColor);
}

export function applyBackgrounds(
  settings: BackgroundSettings,
  theme: "light" | "dark",
): void {
  const defaults = getThemeDefaults(theme);
  const editorResult = resolveColor(settings.editor, defaults.editor);
  const previewResult = resolveColor(settings.preview, defaults.preview);
  const editorText = getContrastTextColor(editorResult.color, theme, editorResult.isCustom);
  const previewText = getContrastTextColor(previewResult.color, theme, previewResult.isCustom);

  const editor = document.querySelector<HTMLElement>(EDITOR_SELECTOR);
  const preview = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);

  applyBackground(editor, editorResult.color, editorText);
  applyBackground(preview, previewResult.color, previewText);

  document.documentElement.style.setProperty("--editor-background", editorResult.color);
  document.documentElement.style.setProperty("--preview-background", previewResult.color);
  document.documentElement.style.setProperty("--editor-text-color", editorText);
  document.documentElement.style.setProperty("--preview-text-color", previewText);
}

export function resetToThemeDefaults(theme: "light" | "dark"): void {
  const defaults = getThemeDefaults(theme);
  const editor = document.querySelector<HTMLElement>(EDITOR_SELECTOR);
  const preview = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);

  if (editor) {
    editor.style.removeProperty("--custom-background");
    editor.style.removeProperty("--custom-text-color");
  }
  if (preview) {
    preview.style.removeProperty("--custom-background");
    preview.style.removeProperty("--custom-text-color");
  }

  document.documentElement.style.setProperty("--editor-background", defaults.editor);
  document.documentElement.style.setProperty("--preview-background", defaults.preview);
  document.documentElement.style.setProperty("--editor-text-color", defaults.text);
  document.documentElement.style.setProperty("--preview-text-color", defaults.text);
}

export function resolveSystemTheme(
  media = window.matchMedia(SYSTEM_DARK_QUERY),
): ResolvedTheme {
  return media.matches ? "dark" : "light";
}

export function watchSystemTheme(
  onChange: (theme: ResolvedTheme) => void,
): () => void {
  const media = window.matchMedia(SYSTEM_DARK_QUERY);
  const handleChange = (event: MediaQueryListEvent): void => {
    onChange(event.matches ? "dark" : "light");
  };
  media.addEventListener("change", handleChange);
  return () => media.removeEventListener("change", handleChange);
}
