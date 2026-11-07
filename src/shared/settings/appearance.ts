export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export function parseHexColor(value: unknown): Rgb | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed !== value) {
    return null;
  }

  if (trimmed.length === 4 && trimmed[0] === '#') {
    const r = parseHexDigit(trimmed.charAt(1));
    const g = parseHexDigit(trimmed.charAt(2));
    const b = parseHexDigit(trimmed.charAt(3));
    if (r === null || g === null || b === null) {
      return null;
    }
    return { r: r * 17, g: g * 17, b: b * 17 };
  }

  if (trimmed.length === 7 && trimmed[0] === '#') {
    const r = parseHexByte(trimmed.slice(1, 3));
    const g = parseHexByte(trimmed.slice(3, 5));
    const b = parseHexByte(trimmed.slice(5, 7));
    if (r === null || g === null || b === null) {
      return null;
    }
    return { r, g, b };
  }

  return null;
}

export function formatHexColor(color: Rgb): string {
  const r = Math.round(color.r).toString(16).padStart(2, '0');
  const g = Math.round(color.g).toString(16).padStart(2, '0');
  const b = Math.round(color.b).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function linearize(c: number): number {
  const s = c / 255;
  if (s <= 0.03928) {
    return s / 12.92;
  }
  return ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: Rgb): number {
  const r = linearize(color.r);
  const g = linearize(color.g);
  const b = linearize(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export function textColorFor(background: Rgb): '#000000' | '#ffffff' {
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  const contrastWithWhite = contrastRatio(background, white);
  const contrastWithBlack = contrastRatio(background, black);
  return contrastWithWhite >= contrastWithBlack ? '#ffffff' : '#000000';
}

export function resolveBackground(custom: unknown, themeDefault: string): string {
  const parsed = parseHexColor(custom);
  if (parsed !== null) {
    return formatHexColor(parsed);
  }
  return themeDefault;
}

function parseHexDigit(char: string): number | null {
  const value = parseInt(char, 16);
  return Number.isNaN(value) ? null : value;
}

function parseHexByte(str: string): number | null {
  const value = parseInt(str, 16);
  return Number.isNaN(value) ? null : value;
}