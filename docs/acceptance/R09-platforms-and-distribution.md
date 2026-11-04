# R9 — Windows, macOS, Linux; installer and standalone builds

### AC-R9-01 — A portable build keeps its data beside the executable
status: planned
Given a standalone build with a `portable` marker next to the executable (or AppImage) in a writable folder
When the app starts and settings, session or drafts are written
Then they are under `<folder>/data` and nothing is written to the per-user profile

### AC-R9-02 — An unwritable portable folder degrades instead of failing
status: planned
Given a portable build in a folder the user cannot write to
When the app starts
Then it uses the normal per-user profile and the status bar says why

### AC-R9-03 — One instance; later launches hand their files to it
status: planned
Given the app is running
When it is launched again with a file argument (or macOS sends open-file)
Then no second window or process stays open and the running window opens the file

### AC-R9-04 — The Windows installer adds and removes the context-menu entries
status: planned
Given a per-user install (no admin)
When it completes
Then "Edit with MD Editor" exists for all files and "Open folder in MD Editor" for folders and folder backgrounds, pointing at the installed exe; after uninstall none of the keys remain

### AC-R9-05 — Every shipped dependency is GPL-3-compatible and credited
status: planned
Given the production dependency tree
When the licence check runs
Then it fails on any licence outside the GPL-3-compatible allowlist, and a release contains THIRD_PARTY_NOTICES.txt with every dependency's licence text

### AC-R9-06 — Each release offers installer and standalone downloads per platform
status: planned
Given a version tag is pushed
When the release workflow completes
Then a draft release holds the Windows NSIS installer and portable zip (x64, arm64), macOS dmg (x64, arm64), Linux deb and AppImage (x64, arm64), SHA256SUMS.txt matching every file, and notes from CHANGELOG.md
