export type Theme = 'light' | 'dark' | 'system';
export type LineEndingSetting = 'lf' | 'crlf' | 'cr';

export interface Settings {
  version: 1;
  theme: Theme;
  fontSize: number;
  preview: { scrollSync: boolean; background: string | null };
  editor: { wrap: boolean; tabSize: number; background: string | null };
  encoding: { default: 'utf-8'; lineEndings: LineEndingSetting };
  ignore: string[];
  [key: string]: unknown;
}

const DEFAULT_IGNORE: readonly string[] = ['node_modules', '.git'];

function createDefaultSettings(): Settings {
  return {
    version: 1,
    theme: 'system',
    fontSize: 14,
    preview: { scrollSync: true, background: null },
    editor: { wrap: true, tabSize: 2, background: null },
    encoding: { default: 'utf-8', lineEndings: 'lf' },
    ignore: [...DEFAULT_IGNORE],
  };
}

export const DEFAULT_SETTINGS: Readonly<Settings> = createDefaultSettings();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeTheme(value: unknown): Theme {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }

  return 'system';
}

function normalizeLineEndings(value: unknown): LineEndingSetting {
  if (value === 'lf' || value === 'crlf' || value === 'cr') {
    return value;
  }

  return 'lf';
}

function normalizePreview(value: unknown): { scrollSync: boolean; background: string | null } {
  if (!isRecord(value)) {
    return { scrollSync: true, background: null };
  }

  return {
    scrollSync:
      typeof value['scrollSync'] === 'boolean' ? value['scrollSync'] : true,
    background:
      typeof value['background'] === 'string' ? value['background'] : null,
  };
}

function normalizeEditor(
  value: unknown,
  migrate: boolean,
): { wrap: boolean; tabSize: number; background: string | null } {
  if (!isRecord(value)) {
    return { wrap: true, tabSize: 2, background: null };
  }

  const tabSize =
    migrate && Object.hasOwn(value, 'tabWidth')
      ? value['tabWidth']
      : value['tabSize'];

  return {
    wrap: typeof value['wrap'] === 'boolean' ? value['wrap'] : true,
    tabSize: typeof tabSize === 'number' ? tabSize : 2,
    background:
      typeof value['background'] === 'string' ? value['background'] : null,
  };
}

function normalizeEncoding(value: unknown): {
  default: 'utf-8';
  lineEndings: LineEndingSetting;
} {
  if (!isRecord(value)) {
    return { default: 'utf-8', lineEndings: 'lf' };
  }

  return {
    default: 'utf-8',
    lineEndings: normalizeLineEndings(value['lineEndings']),
  };
}

function normalizeIgnore(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_IGNORE];
  }

  const entries: string[] = [];
  const list: unknown[] = value;
  for (const entry of list) {
    if (typeof entry !== 'string') {
      return [...DEFAULT_IGNORE];
    }
    entries.push(entry);
  }

  return entries;
}

export function normalizeSettings(value: unknown): Settings {
  if (!isRecord(value)) {
    return createDefaultSettings();
  }

  const version = value['version'];
  if (version !== undefined && version !== 0 && version !== 1) {
    return createDefaultSettings();
  }

  const settings: Settings = {
    version: 1,
    theme: normalizeTheme(value['theme']),
    fontSize: typeof value['fontSize'] === 'number' ? value['fontSize'] : 14,
    preview: normalizePreview(value['preview']),
    editor: normalizeEditor(
      value['editor'],
      version === undefined || version === 0,
    ),
    encoding: normalizeEncoding(value['encoding']),
    ignore: normalizeIgnore(value['ignore']),
  };

  for (const [key, entry] of Object.entries(value)) {
    if (!Object.hasOwn(settings, key)) {
      // defineProperty keeps a "__proto__" key as data, not a prototype set.
      Object.defineProperty(settings, key, {
        value: entry,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }

  return settings;
}

export function parseSettings(raw: string): Settings {
  try {
    return normalizeSettings(JSON.parse(raw) as unknown);
  } catch {
    return createDefaultSettings();
  }
}

export function serializeSettings(settings: Settings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}
