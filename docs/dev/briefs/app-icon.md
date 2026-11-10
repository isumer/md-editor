# Brief: use the SolidMD icon in the app and its packages

## Goal
The app and every package show the SolidMD icon from `assets/brand/`,
instead of the default Electron icon.

## Scope
- Copy the icons into electron-builder's resources:
  - `build/icon.ico` from `assets/brand/solidmd.ico`;
  - `build/icon.icns` from `assets/brand/solidmd.icns`;
  - `build/icon.png` from `assets/brand/png/solidmd-1024.png`;
  - `build/icons/<size>x<size>.png` for Linux, from `assets/brand/png/`.
  Point `electron-builder.yml` at these files explicitly, for `win`,
  `mac` and `linux`.
- Set the window icon on Linux and Windows (`BrowserWindow` `icon`, from
  a 512 px or 256 px PNG shipped inside the app). macOS uses the bundle
  icon.
- The NSIS installer and uninstaller, and the "Edit with" context-menu
  entries, use the app icon.

## Out of scope
- Changing, redrawing, recolouring or cropping the icon files. Use the
  bytes in `assets/brand/` as they are.
- Renaming (brief `rename-solidmd.md`), behaviour changes.

## Acceptance
- A test asserts that `electron-builder.yml` names the three icon files
  and that each file exists and is byte-identical to its source in
  `assets/brand/`.
- A unit test asserts that the main window is created with the icon path
  on Linux and Windows.
- CI is green on all three platforms. The Linux `.deb` contains
  `usr/share/icons/hicolor/256x256/apps/<name>.png` (checked in CI with
  `dpkg-deb -c`).
