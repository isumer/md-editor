# R11 — Workspace sidebar

### AC-R11-01 — Open Folder shows the folder as a lazy tree
status: implemented
Given the user chooses a folder with Open Folder
When the sidebar shows it
Then the panel lists the folder's subfolders and `.md` files with folders first, hides `node_modules` and names starting with `.`, and loads a folder's children only when the folder is expanded

### AC-R11-02 — A second expand reuses the loaded children
status: implemented
Given a folder's children are already loaded
When the user collapses and expands that folder again
Then no new listing is requested, and a 5,000-file folder lists in under 500 ms while the editor still accepts typing

### AC-R11-03 — The filter narrows the tree by name
status: implemented
Given a workspace tree is shown
When the user types a filter
Then only entries whose name matches case-insensitively are shown, a matching file keeps its ancestor folders visible, and a filter with no match shows an empty message

### AC-R11-04 — Clicking a file opens it in a tab
status: implemented
Given the workspace tree is shown
When the user clicks a `.md` file
Then its tab opens and is editable within 100 ms for a 100 KB file, and clicking a path that is already open focuses its existing tab

### AC-R11-05 — The tree follows changes on disk
status: planned
Given a folder is shown in the tree
When a `.md` file is created, changed or deleted on disk
Then the tree shows the change within 1 s without a manual refresh, a deleted open clean file closes its tab, and a deleted dirty file stays open

### AC-R11-06 — The sidebar toggles with CmdOrCtrl+B
status: planned
Given the sidebar is open or closed
When the user presses CmdOrCtrl+B
Then the sidebar toggles within 50 ms and the open or closed state survives a restart

### AC-R11-07 — Workspace file actions stay inside the root
status: planned
Given a workspace root is chosen
When the user creates, renames or deletes a file through the tree
Then `..`, absolute paths, UNC paths, symlinks that leave the root, Windows device names and alternate data streams are refused, and no write happens outside the root

### AC-R11-08 — A failed file action names the failure and changes nothing
status: planned
Given a tree entry
When a create, rename or delete fails (missing file, permission denied, name conflict)
Then the message names the entry and explains the reason in plain words, and the tree still shows the state before the action
