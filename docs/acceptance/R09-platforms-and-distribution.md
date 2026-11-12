# R9 — Windows, macOS, Linux; installer and standalone builds

### AC-R9-01 — A portable build keeps its data beside the executable
status: implemented
Given a standalone build with a `portable` marker next to the executable (or AppImage) in a writable folder
When the app starts and settings, session or drafts are written
Then they are under `<folder>/data` and nothing is written to the per-user profile

### AC-R9-02 — An unwritable portable folder degrades instead of failing
status: implemented
Given a portable build in a folder the user cannot write to
When the app starts
Then it uses the normal per-user profile and the status bar says why

### AC-R9-03 — One instance; later launches hand their files to it
status: implemented
Given the app is running
When it is launched again with a file argument (or macOS sends open-file)
Then no second window or process stays open and the running window opens the file

### AC-R9-04 — The Windows installer adds and removes the context-menu entries
status: planned
Given a per-user install (no admin)
When it completes
Then "Edit with SolidMD" exists for all files and "Open folder in SolidMD" for folders and folder backgrounds, pointing at the installed exe; after uninstall none of the keys remain

### AC-R9-05 — Every shipped dependency is GPL-3-compatible and credited
status: implemented
Given the production dependency tree
When the licence check runs
Then it fails on any licence outside the GPL-3-compatible allowlist, and a release contains THIRD_PARTY_NOTICES.txt with every dependency's licence text

### AC-R9-06 — Each release offers installer and standalone downloads per platform
status: planned
Given a version tag is pushed
When the release workflow completes
Then a draft release holds the Windows NSIS installer and portable zip (x64, arm64), macOS dmg (x64, arm64), Linux deb and AppImage (x64, arm64), SHA256SUMS.txt matching every file, and notes from CHANGELOG.md

### AC-R9-07 — Help > Check for Updates says what it found
status: planned
Given a release newer than the running version exists on the release feed (and, separately, none does, and the feed is unreachable)
When the user picks Help > Check for Updates
Then the app names the new version with its release notes, or says it is up to date, or says the check failed and why; nothing is downloaded without the user's yes

### AC-R9-08 — The startup check is daily at most and can be turned off
status: planned
Given update checks are on (default) and the last check was under 24 h ago, and separately update checks are off in settings
When the app starts
Then no request is made in either case; after 24 h with checks on, one request is made off the UI thread and startup is not delayed

### AC-R9-09 — Installer and AppImage builds update themselves
status: planned
Given a Windows NSIS install or a Linux AppImage, a newer release, and the user accepts the update
When the download completes
Then the file is verified against the release's checksum, the update installs on "Restart now" or at the next quit, unsaved documents go through the quit prompt first (AC-R4-06), and the app starts in the new version with the session restored

### AC-R9-10 — Other builds notify and open the download page
status: planned
Given an unsigned macOS build, a portable build, or a deb install, and a newer release
When an update is found
Then the app offers to open the release page and never replaces its own files; when the macOS build is signed, it follows AC-R9-09 instead

### AC-R9-11 — A bad or tampered download never installs
status: planned
Given an update download that fails, is cut short, or does not match the release checksum
When the download ends
Then nothing is installed, the running version is unchanged, the partial file is removed, and the app says the update failed and can retry later
