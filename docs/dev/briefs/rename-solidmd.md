# Brief: rename the product to SolidMD

The repository is now `isumer/solidmd` (owner, 2026-11-11). The product name
becomes **SolidMD** everywhere a user or a tool sees it.

## Scope

1. `package.json`: `name` → `solidmd`, `productName` → `SolidMD`; regenerate
   `package-lock.json` with `npm install --package-lock-only` (no dependency changes).
2. `electron-builder.yml`: `appId` → `io.github.isumer.solidmd`; artifact and
   executable names follow `productName`. No release has shipped, so no
   migration of user data or settings is needed.
3. Update feed: `src/main/update/releaseFeed.ts` points at
   `repos/isumer/solidmd/releases/latest`; adjust its fixtures and tests.
4. Windows shell entries (`build/installer.nsh`): labels read "Edit with SolidMD"
   and "Open folder in SolidMD"; registry keys become `SolidMDEdit` / `SolidMDOpen`.
5. `.github/workflows/release.yml`: unpacked paths and the portable folder use the
   new executable name.
6. Window title, About dialog, menus and any user-visible string "MD Editor" →
   "SolidMD".
7. README, SECURITY, CHANGELOG (a new "Renamed to SolidMD" line), PLAN, docs/release,
   issue templates, CI badges and every `github.com/isumer/md-editor` link →
   `isumer/solidmd`.
8. Tests and scripts that assert on the old name or title (e2e helpers, specs,
   `scripts/smoke-appimage.mjs`, `scripts/check-acceptance.mjs`) follow the new name.
   Temp-directory prefixes may become `solidmd-`.

## Out of scope

- Icons and logo files: the artwork is not final; do not add or change icons.
- Historical briefs and reviews under `docs/dev/briefs/` and `docs/reviews/`:
  leave them as written.
- No behaviour change, no budget change, no test skipped or loosened.

## Acceptance

- `git grep -nI -e 'MD Editor' -e 'md-editor'` outside `docs/dev/briefs/`,
  `docs/reviews/` and the CHANGELOG history returns nothing.
- Lint, typecheck, unit and e2e suites pass on all three CI platforms.
- A packaged Linux build starts and its window title reads "SolidMD".
