# Slice 14 part 2 — Release feed check (dev lane)

Base: main

Follow AGENTS.md. Add one pure module in the main process and its unit
tests. The module takes its fetch function as an argument, so it makes no
network call of its own in tests. No wiring, no IPC, no window, no menu,
no setting, no timer. AC-R9-07 stays `planned`; do not edit
`docs/acceptance/`. No new dependencies.

The module reads the parsed release through the merged policy module, so
the two items never disagree: `parseReleaseFeed`, `parseVersion`,
`isNewerRelease` and the `ReleaseInfo` type all come from
`src/shared/update/updatePolicy.ts`.

## Allowed files
New files only:
- `src/main/update/releaseFeed.ts`
- `test/unit/releaseFeed.test.ts`

Change no other file. Do not import `electron` or any node built-in in
the new module; its only import is from
`../../shared/update/updatePolicy`.

## Exact exports
1. `export const RELEASE_FEED_URL = "https://api.github.com/repos/isumer/md-editor/releases/latest";`
2. `export interface FeedResponse { readonly status: number; text(): Promise<string>; }`
3. `export type FetchFeed = (url: string) => Promise<FeedResponse>;`
4. `export type ReleaseCheckFailure = "bad-current-version" | "unreachable" | "bad-status" | "too-large" | "bad-feed";`
5. `export type ReleaseCheck = { readonly kind: "newer"; readonly release: ReleaseInfo } | { readonly kind: "current" } | { readonly kind: "failed"; readonly reason: ReleaseCheckFailure };`
6. `export async function checkReleaseFeed(input: { readonly currentVersion: string; readonly fetchFeed: FetchFeed }): Promise<ReleaseCheck>`

## Rules, in this order
1. `parseVersion(input.currentVersion)` is `null` → return
   `{ kind: "failed", reason: "bad-current-version" }` with no fetch.
2. Call `input.fetchFeed(RELEASE_FEED_URL)` exactly once, with that exact
   constant. The module never takes a feed URL from a caller and never
   reads one from settings.
   A synchronous throw or a rejected promise → `failed` / `unreachable`.
3. `response.status !== 200` → `failed` / `bad-status`. Do not call
   `text()` in that case.
4. `await response.text()`; a throw or rejection → `failed` /
   `unreachable`. If the text is longer than 262,144 characters →
   `failed` / `too-large`. Check the length before parsing.
5. `JSON.parse` the text inside try/catch; a throw → `failed` /
   `bad-feed`.
6. `parseReleaseFeed(parsed)` is `null` → `failed` / `bad-feed`.
7. `isNewerRelease(release.version, input.currentVersion)` is `true` →
   `{ kind: "newer", release }` with the exact object `parseReleaseFeed`
   returned (the version keeps its `v`). Otherwise `{ kind: "current" }`.
8. The function never throws for any input.

## Tests (each titled `AC-R9-07: ...`)
Use inline response doubles; read no fixture file.

- A feed with tag `v1.4.2` against current `1.4.1` → `{ kind: "newer",
  release: { version: "v1.4.2", url: "https://github.com/isumer/md-editor/releases/tag/v1.4.2", notes: "..." } }`;
  also assert `fetchFeed` was called once with `RELEASE_FEED_URL`.
- Equal version (`v1.4.2` against `v1.4.2`) → `current`.
- Older version (`v1.4.1` against `v1.4.2`) → `current`.
- Prerelease tag `v1.4.2-beta.1` against current `1.4.2` → `current`
  (a prerelease is not newer than its release).
- Current `1.4` → `failed` / `bad-current-version` and `fetchFeed` was
  not called.
- `fetchFeed` rejects → `failed` / `unreachable`.
- `fetchFeed` throws synchronously → `failed` / `unreachable`.
- Status `500` with valid JSON text → `failed` / `bad-status` and
  `text()` was not called.
- `text()` rejects → `failed` / `unreachable`.
- A valid feed text of exactly 262,144 characters is accepted; one more
  character (262,145) → `failed` / `too-large`. Build the length by
  appending trailing spaces to the accepted JSON text; `JSON.parse`
  accepts trailing whitespace, and the accepted case still returns
  `newer`. Do not build the cap cases from whitespace alone.
- Text that is not JSON → `failed` / `bad-feed`.
- Valid JSON that `parseReleaseFeed` rejects (e.g. an array, or
  `html_url` starting with `http://`) → `failed` / `bad-feed`.
- The function returns a value (never throws) for every case above.

## Done means
- Red first: paste the run of the new test file before the module exists
  (import failure is the expected red).
- Green: `npx vitest run test/unit/releaseFeed.test.ts` all pass;
  `npm run typecheck` and `npm run check:deps` pass.
- Mutations, each pasted with the test that goes red:
  - remove the `status !== 200` check → the `500` test fails;
  - remove the 262,144 character cap → the `too-large` test fails;
  - remove the `parseVersion` check → the `bad-current-version` test
    fails;
  - invert the `isNewerRelease` result → the newer/current tests fail.
- `git diff --stat origin/main...HEAD` names only the two new files.
- Report the coverage of the new file if the unit run prints it.
