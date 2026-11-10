# Releasing SolidMD

SolidMD releases are built on native Linux, Windows, and macOS runners. Builds are currently unsigned, so Windows SmartScreen and macOS Gatekeeper can warn on first launch.

## Cut a release

1. Move the release changes from `Unreleased` into a dated `X.Y.Z` or `X.Y.Z-beta.N` section in `CHANGELOG.md` and update its comparison links.
2. Commit that change, then create an annotated tag such as `v0.0.2-beta.1` and push the tag.
3. Wait for every release matrix job to run the full verification suite, package both architectures, check Electron fuses, and complete the platform smoke checks.
4. Open the generated draft GitHub release. Check that every expected asset is present, verify `SHA256SUMS.txt`, and confirm that each macOS app has the architecture named by its DMG.
5. Publish the draft. Tags containing `-` are created as pre-releases; stable tags are not.

`workflow_dispatch` has a dry-run option that builds and verifies every artifact without creating a GitHub release.

## Assets

- `SolidMD-Setup-X.Y.Z-x64.exe` and `-arm64.exe` are per-user Windows NSIS installers. They add classic Explorer file and folder context-menu entries and remove them on uninstall.
- `SolidMD-X.Y.Z-win-x64-portable.zip` and `-arm64-portable.zip` are unpacked Windows applications with a `portable` marker. They do not self-extract at launch.
- `SolidMD-X.Y.Z-x64.dmg` and `-arm64.dmg` are the Intel and Apple Silicon macOS disk images.
- `SolidMD_X.Y.Z_amd64.deb` and `_arm64.deb` install the Linux desktop entry and MIME registrations on Debian-family distributions.
- `SolidMD-X.Y.Z-x86_64.AppImage` and `-arm64.AppImage` are standalone Linux applications.
- `SHA256SUMS.txt` contains a SHA-256 digest for every downloadable platform asset.

## Portable Windows packaging

The Windows zip uses electron-builder's `zip` target, not its self-extracting `portable` target. After NSIS and zip artifacts have been built, `scripts/add-portable-marker.mjs` temporarily copies an empty `portable` marker into the matching `win-unpacked` directory and rebuilds only the zip with electron-builder's bundled archive implementation. The marker is then removed from the unpacked directory, so it cannot enter the installer.

At startup the app looks for that marker next to its executable. For AppImages it looks next to the `.AppImage` path supplied by `APPIMAGE`. A writable marker location uses the adjacent `data` directory; otherwise the app reports the fallback in its status bar and uses the normal profile.

The installer owns Windows context-menu registration. Portable builds never add registry entries by themselves. Registration as an Open With handler and selection as the `.md` default are intentionally deferred until the installer-options page is implemented.

## Generated licences

Packaging generates `dist/THIRD_PARTY_NOTICES.txt` from the production dependency tree and places it beside `LICENSE.md` in the application resources. `npm run check:licenses` performs the same traversal without writing the generated, gitignored file and fails if a dependency is outside the approved GPL-compatible licence policy.
