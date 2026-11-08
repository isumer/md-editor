review: deep

# Slice 14 part 1 — Update policy module (R9)

Base: main

Follow AGENTS.md. Add one pure module and its unit tests. No wiring, no
menu item, no network request and no window. This item does not flip any
acceptance criterion: AC-R9-07, -08, -10 and -11 stay `planned` until the
wiring item shows the user surface.

## Allowed files
New files only:
- `src/shared/update/updatePolicy.ts`
- `test/unit/updateVersion.test.ts`
- `test/unit/updateFeed.test.ts`
- `test/unit/updatePolicy.test.ts`

Do not change any other file. `src/shared` files have zero imports, so
`updatePolicy.ts` imports nothing.

## What
Export exactly these values and functions from `updatePolicy.ts`.

1. `export interface ReleaseInfo { version: string; url: string; notes: string }`
2. `export function parseVersion(text: string): Version | null` where
   `export interface Version { major: number; minor: number; patch: number; prerelease: readonly string[] }`
   - Accept an optional leading `v`, then `major.minor.patch`, each part
     0..999999 with no leading zero, an optional `-prerelease` of
     dot-separated `[0-9A-Za-z-]+` identifiers, and an optional `+build`
     that is ignored.
   - Reject an empty string, whitespace, fewer or more than three numeric
     parts, leading zeros, an empty prerelease identifier and any other
     character.
3. `export function compareVersions(a: string, b: string): number | null`
   - Return -1, 0 or 1 by semver precedence, or null when either text is
     invalid. A release is newer than every prerelease of the same
     version. Compare two numeric identifiers by value; compare any other
     pair by ASCII order. A longer prerelease list wins when all shared
     identifiers are equal.
4. `export function isNewerRelease(candidate: string, current: string): boolean`
   - True only when both parse and the candidate has higher precedence.
5. `export function parseReleaseFeed(value: unknown): ReleaseInfo | null`
   - Accept exactly an own-data object with the keys `tag_name`,
     `html_url`, `body` and no others. `tag_name` must parse with
     `parseVersion`; `html_url` must be a string that starts with
     `https://` and is at most 2048 characters; `body` must be a string
     of at most 64 KiB. Return the parsed version text, the URL and the
     notes. Reject an array, a null, a getter, a proxy that throws, a
     missing key and an extra key.
6. `export function parseChecksum(value: unknown): string | null`
   - Accept `sha256:` followed by 64 hex digits in either case, or a bare
     64 hex digits. Return the 64 digits in lower case. Reject anything
     else.
7. `export function shouldCheckForUpdates(input: ShouldCheckInput): boolean`
   where `export interface ShouldCheckInput { enabled: boolean; lastCheckedAt: number | null; now: number }`
   - False when `enabled` is false, when `now` is not a finite epoch
     millisecond value, or when `lastCheckedAt` is not null and is not a
     finite value at or after 0.
   - True when `lastCheckedAt` is null or `now - lastCheckedAt` is at
     least 24 h in milliseconds. False when the gap is smaller.
8. `export type UpdateKind = "installer" | "appimage" | "portable" | "deb" | "mac-unsigned" | "mac-signed"`
   `export type UpdateAction = "install" | "notify" | "none"`
   `export function updateActionFor(kind: UpdateKind, newer: boolean): UpdateAction`
   - Not newer gives `"none"`. `installer`, `appimage` and `mac-signed`
     give `"install"`. `portable`, `deb` and `mac-unsigned` give
     `"notify"`.

All functions are pure. Use one-line comments only where a rule needs a
why.

## Tests
Tag each test with the criterion it serves. Use exact expected values.

- `updateVersion.test.ts`
  - AC-R9-07: parses release, prerelease and build forms.
  - AC-R9-07: rejects each rejected form above.
  - AC-R9-07: orders major, minor, patch and prerelease correctly.
  - AC-R9-07: a release beats its own prerelease; two equal versions
    compare 0; an invalid side gives null.
- `updateFeed.test.ts`
  - AC-R9-07: returns version, URL and notes from an accepted feed.
  - AC-R9-07: rejects an array, a null, a getter, a throwing proxy, a
    missing key, an extra key, a non-https URL and an oversized body.
  - AC-R9-11: accepts both checksum forms and lower-cases them; rejects
    a short digest, a wrong algorithm and a non-string.
- `updatePolicy.test.ts`
  - AC-R9-08: checks when the last check is null or 24 h old; skips when
    disabled, under 24 h, or the clock is invalid.
  - AC-R9-10: the action for each kind, and `"none"` when no update.

## Red evidence
After the tests pass, break each rule once and record the failing test:
the semver prerelease order, the 24 h boundary, one kind mapping and the
checksum case fold. Restore each line.

## Done means
`npx vitest run test/unit/updateVersion.test.ts test/unit/updateFeed.test.ts test/unit/updatePolicy.test.ts`
is green, `npm run typecheck` is green and `npm run check:deps` is green.
No acceptance file or coverage baseline changes.
