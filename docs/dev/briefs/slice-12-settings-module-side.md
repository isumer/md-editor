# Slice 12 module part — settings load, migrate and save (side lane)

Base: main

A pure module that normalises, migrates and serialises settings. Slice 12
wires it into the main process and settings UI later (dev lane). This item
adds no wiring, no IPC and no UI. Criterion AC-R08-01 in
`docs/acceptance/R08-themes-and-settings.md` is planned; do not edit it.
No new dependencies.

## The module
New file `src/shared/settings/settings.ts`. No imports. Exports exactly:
- `export type Theme = 'light' | 'dark' | 'system';`
- `export type LineEndingSetting = 'lf' | 'crlf' | 'cr';`
- `export interface Settings { version: 1; theme: Theme; fontSize: number; preview: { scrollSync: boolean }; editor: { wrap: boolean; tabSize: number }; encoding: { default: 'utf-8'; lineEndings: LineEndingSetting }; ignore: string[]; [key: string]: unknown; }`
- `export const DEFAULT_SETTINGS: Readonly<Settings>`
- `export function normalizeSettings(value: unknown): Settings`
- `export function parseSettings(raw: string): Settings`
- `export function serializeSettings(settings: Settings): string`

Rules, in this order:
1. The defaults are `version: 1`, `theme: "system"`, `fontSize: 14`,
   `preview.scrollSync: true`, `editor.wrap: true`,
   `editor.tabSize: 2`, `encoding.default: "utf-8"`,
   `encoding.lineEndings: "lf"`, `ignore: ["node_modules", ".git"]`.
2. `normalizeSettings` returns a fresh object on every call; it never
   returns `DEFAULT_SETTINGS` itself and never mutates the input.
3. A value that is not a plain object (null, an array, a primitive) gives
   the defaults.
4. A missing `version` or version `0` migrates: rename
   `editor.tabWidth` to `editor.tabSize`, keep its value, and set
   `version` to 1. Any other version except 1 gives the defaults.
5. Every known key whose value has the wrong type gives that key its
   default. A nested object is normalised key by key. `ignore` must be an
   array of strings; any other value gives the default.
6. Unknown top-level keys are copied to the result unchanged.
7. `parseSettings` calls `JSON.parse` in a `try`; invalid JSON gives the
   defaults. It never throws.
8. `serializeSettings` is `JSON.stringify(settings, null, 2)` plus one
   final `"\n"`.

## Tests (`test/unit/settings.test.ts`)
Every title starts `AC-R08-01:`. Read the fixtures in
`test/fixtures/settings/` with `node:fs`.
- `loads every value from the complete fixture` — `complete.json` gives
  exactly `system`, `14`, `true`, `true`, `2`, `utf-8`, `lf` and
  `["node_modules", ".git"]`.
- `fills defaults for a partial file` — `partial.json` gives `theme`
  `dark` and every other value equal to `DEFAULT_SETTINGS`.
- `keeps unknown keys` — `unknown-keys.json` keeps `futureOption` and
  `futureFlag`; serialize then parse gives the same object.
- `migrates version 0` — `version-old.json` gives `editor.tabSize` 2 and
  version 1.
- `returns defaults for a corrupt file` — `corrupt-truncated.json` and
  `empty.json` give the defaults and do not throw.
- `rejects an array` — `corrupt-array.json` gives the defaults.
- `round-trips a saved file` — parse, serialize, parse gives the same
  object.

Red evidence: run the tests before the module exists (import fails), then
with the version-0 migration removed (`migrates version 0` goes red).
Paste both.

## Allowed files
src/shared/settings/settings.ts, test/unit/settings.test.ts. Nothing else
— no other src file, no fixtures, no acceptance docs, no coverage config,
no workflows.

## Done means
typecheck, check:deps, test:unit, check:coverage exit 0 — paste; list
changed files; paste the red evidence.
