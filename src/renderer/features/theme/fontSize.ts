export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 32;
export const DEFAULT_FONT_SIZE = 14;

export function clampFontSize(size: number): number {
  if (!Number.isFinite(size)) {
    return DEFAULT_FONT_SIZE;
  }
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
}

export function changeFontSize(current: number, delta: number): number {
  return clampFontSize(current + delta);
}

export function applyFontSize(
  size: number,
  root: HTMLElement = document.documentElement,
): void {
  root.style.setProperty("--editor-font-size", `${String(clampFontSize(size))}px`);
}
