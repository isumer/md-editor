# Slice 8 part — user key bindings resolver (NIM lane)

Base: main

A pure module that merges a user binding table (from settings) into the
default key bindings. Slice 8 wiring passes the result to
`installKeymap` later. This item adds no settings read, no wiring and no
UI. AC-R13-05 stays `planned`. No new dependencies.

Parts: this module part only. Depends on: main. Nothing waits for it.

## Allowed files
New files only:
- `src/shared/keymap/userBindings.ts`
- `test/unit/userBindings.test.ts`

Change no other file. `src/shared` modules have zero imports, so
`userBindings.ts` imports nothing. Read `src/renderer/core/keymap.ts`
(`chordForEvent`) to see the chord form; do not import it.

## Types
Export exactly these from `userBindings.ts`.

```ts
export type Bindings = Readonly<Record<string, string | undefined>>;
export type BindingProblemReason =
  | "invalid-table" | "invalid-chord" | "invalid-command"
  | "unreachable-chord" | "duplicate";
export interface BindingProblem {
  readonly chord: string;
  readonly reason: BindingProblemReason;
}
export interface ResolvedBindings {
  readonly bindings: Bindings;
  readonly problems: readonly BindingProblem[];
}
export function normalizeChord(chord: string, platform: string): string | null;
export function resolveUserBindings(
  defaults: Bindings,
  user: unknown,
  platform: string,
): ResolvedBindings;
```

## Chord rules (`normalizeChord`)
1. A chord is parts joined by `-`. The last part is the key. Every other
   part is a modifier: exactly `Mod`, `Ctrl`, `Meta`, `Alt` or `Shift`
   (case-sensitive), each at most once, in any order. At least one
   modifier is required.
2. The key is one of:
   - one character that is not `-` and not whitespace. A letter is
     lower-cased (`Mod-S` gives `Mod-s`).
   - a named key, case-sensitive: `Enter`, `Escape`, `Tab`, `Backspace`,
     `Delete`, `Insert`, `Home`, `End`, `PageUp`, `PageDown`, `ArrowUp`,
     `ArrowDown`, `ArrowLeft`, `ArrowRight`, `F1` to `F12`.
3. The result lists the modifiers in this order: `Mod`, `Ctrl`, `Meta`,
   `Alt`, `Shift`, then the key. Example: `Shift-Mod-k` gives
   `Mod-Shift-k`. This is the order `chordForEvent` produces.
4. On `darwin`, `Meta` is the same key as `Mod`, so a chord with `Meta`
   returns `null`. On every other platform, `Ctrl` is the same key as
   `Mod`, so a chord with `Ctrl` returns `null`.
5. Anything else returns `null`: an empty string, an empty part
   (`Mod--`, `-a`), an unknown modifier, a repeated modifier, a key of
   two or more characters that is not a named key.

## Resolve rules (`resolveUserBindings`)
1. Start from a copy of `defaults`. Do not validate or normalise the
   defaults.
2. `user` must be a plain object (not `null`, not an array). Otherwise
   return the copy of `defaults` and one problem
   `{ chord: "", reason: "invalid-table" }`.
3. Walk `Object.keys(user)` in order. For each key and value:
   - the chord does not normalise: problem `invalid-chord` with the key
     as written.
   - on `win32`, a normalised chord with both `Mod` and `Alt` whose key
     is one character: problem `unreachable-chord` (AltGr input never
     fires a command; see docs/architecture.md "Keys").
   - an earlier user key normalised to the same chord: problem
     `duplicate` with the key as written. The first entry wins.
   - the value is `null`: the chord is unbound (its value becomes
     `undefined`).
   - the value is a non-empty string with no whitespace: the chord is
     bound to that command id. Command existence is not checked here.
   - any other value: problem `invalid-command`.
   A key with a problem changes no binding. Check the reasons in the
   order above and report one problem per key.
4. Only own keys count. A key named `__proto__` is just an invalid chord;
   it must not change any prototype.
5. Return `bindings` and `problems` frozen. No function mutates its
   inputs.

## Tests (`test/unit/userBindings.test.ts`)
Every title starts `AC-R13-05:`. Use exact expected values.
- `normalises modifier order and letter case` — `Shift-Mod-K` gives
  `Mod-Shift-k` on `linux`; `Alt-Mod-F5` gives `Mod-Alt-F5`.
- `rejects malformed chords` — `""`, `"k"`, `"Mod-"`, `"Mod--"`,
  `"-a"`, `"Hyper-a"`, `"Mod-Mod-a"`, `"Mod-Shift-ab"`, `"Mod-f13"`,
  `"Mod- "` all give `null`.
- `applies the platform's modifier names` — `Ctrl-Mod-a` is valid on
  `darwin` and `null` on `linux`; `Meta-a` is valid on `linux` and
  `null` on `darwin`.
- `binds, rebinds and unbinds` — defaults `{ "Mod-s": "file.save",
  "Mod-y": "redo" }`, user `{ "Mod-Shift-K": "lines.delete", "Mod-s":
  "file.saveAll", "Mod-y": null }` give `{ "Mod-s": "file.saveAll",
  "Mod-y": undefined, "Mod-Shift-k": "lines.delete" }` with no problems.
- `reports every invalid entry and keeps the defaults` — one entry per
  reason: `invalid-chord`, `invalid-command` (`""`, `"a b"`, `42`),
  `duplicate` (`"Mod-k"` then `"Mod-K"`: the first wins). Assert the
  exact problem list in key order.
- `reports AltGr chords on Windows only` — `Mod-Alt-q` is
  `unreachable-chord` on `win32` and bound on `linux`; `Mod-Alt-F5` is
  bound on `win32`.
- `rejects a table that is not a plain object` — `null`, `[]`, `"x"` and
  `42` each give the defaults and one `invalid-table` problem.
- `ignores a __proto__ key` — parse `{"__proto__": "x"}` with
  `JSON.parse`; the result has an `invalid-chord` problem and
  `Object.getPrototypeOf(result.bindings)` is `Object.prototype`.
- `does not mutate its inputs` — freeze `defaults` and `user`; the result
  is frozen.

Red evidence: break chord rule 3's order, resolve rule 3's `duplicate`
check and the `win32` AltGr check once each, confirm a test goes red,
and restore the line. Paste all three runs.

## Done means
`npm run typecheck`, `npm run check:deps` and `npm run test:unit` exit 0
— paste. List changed files. Paste the red evidence. Do not change the
coverage baseline, acceptance files or workflows.
