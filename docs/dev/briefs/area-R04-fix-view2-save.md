# Fix: Save and dirty state in the second view (area R04)

Base: feature/area-R04 (fix continues its own PR branch)
Allowed files: src/renderer/main.ts, src/renderer/editor/editor.ts, src/renderer/tabs/documentCommands.ts, test/e2e/document-views.spec.ts, test/unit/tabsDocumentCommands.test.ts

## Findings
1. `src/renderer/main.ts`: the lifecycle `active` is `activeDocument` and Save uses `lifecycle.saveActive`. Save and Save As act on the view-1 document when view 2 has focus. Save As can write the wrong document.
2. `src/renderer/main.ts`: both editors share one `documentState`. A view-2 edit compares view-2 text with view-1 saved text and can mark the clean view-1 document dirty.

## Required
- Save and Save As target the document of the focused view (`secondaryDocument` when `editorTwo.hasFocus`).
- Dirty and title calculation compare each view's text with its own document's saved text.
- E2E: move `beta.md` to view 2, edit, save from view 2. Only `beta.md` changes on disk.
- E2E: a view-2 edit never marks the clean view-1 document dirty.
- Mutate the focused-document selection. Both tests must go red. Record it.
- Run full verify through locked-npm. Do not lower thresholds.
