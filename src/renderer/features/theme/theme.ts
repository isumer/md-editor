import type { Theme } from "../../../shared/settings/settings";

export type ResolvedTheme = "light" | "dark";

export function resolveTheme(
  preference: Theme,
  systemTheme: ResolvedTheme,
): ResolvedTheme {
  return preference === "system" ? systemTheme : preference;
}

export function applyTheme(
  theme: ResolvedTheme,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset["theme"] = theme;
}
