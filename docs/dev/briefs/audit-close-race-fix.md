# Brief: audit fix — quit and close races must not discard unsaved edits

Source: Friday audit of merge ed29100 (2026-11-09). The defects are in slice 5 tabs/session code that arrived through that merge; this is not slice 6 tree-update work. Branch: `bug/audit-slice-6-tree-updates-fix-fix` (name kept from the queue; ignore the "slice-6" in it).

## Findings to fix (from the audit)

Audit of ed29100 (the 94 files are slice 5 tabs/session code that arrived via sync merge from main; slice 6's own content, treeUpdates.ts + tests, is correct and unwired as briefed). Two data-loss defects in that code. (1) src/main/app/closeRequests.ts:35,48 - CloseRequestBroker times out after 15 s and resolve(true) closes the window with no session snapshot, while the renderer is still waiting on the user at the unsaved-changes prompt (documentLifecycle.ts:178 handleSessionClose, also during a slow Save of a large file). A user who takes over 15 s to answer loses every dirty tab silently; test/unit/closeRequests.test.ts:'an unanswered close times out and never wedges shutdown' pins this. Done = a pending request is not timed out while the renderer has the prompt or a save in flight (e.g. renderer sends a keepalive/ack that resets the timer, or the timeout only covers a renderer that never acknowledged), a truly dead renderer still cannot wedge quit, and a unit test fails on the 15 s-with-open-prompt case. Do not change AC-R4-06 semantics. (2) src/renderer/tabs/documentLifecycle.ts:127-139 closeTab - after Save succeeds it calls this.options.remove(document) unconditionally; markDocumentSaved keeps the doc dirty if the user typed during the save (core/document.ts:113), but removeDocument then discards that text and clears its draft. Done = after a successful save, closeTab re-checks document.dirty and keeps the tab open (or re-prompts) if it is dirty again; add a unit test in test/unit/tabsDocumentLifecycleSave.test.ts that makes the doc dirty while saveDocument is pending and expects remove not called (red against current code). Change only these files and their tests.


## Scope

Allowed files: `src/main/app/closeRequests.ts`, `src/renderer/tabs/documentLifecycle.ts`, their unit tests. No tree-update change is expected. Each defect needs a unit test that fails on the old code.
