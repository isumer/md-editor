review: opus

# Slice 4 fix — preview pipeline: typecheck, render equivalence, 20 MB path

Work on branch `auto/025-slice-4-preview-pipeline-1105-1007` (your slice 4
result). First run `git merge origin/main` (3e command registry and the
fixture side branches landed there; `src/renderer/main.ts` conflicts with
3e). Read `docs/dev/briefs/slice-4.md` again: its goals, tests and budgets
still hold. This brief lists what the review found. No new dependencies.

## Findings to fix (each needs a test that is red first)

1. **Typecheck fails after merging main (blocker).** `main.ts` dropped
   `import type { Text } from "@codemirror/state"`, but 3e's save code uses
   `Text` (`markSaved`, `SaveSnapshot`), so TypeScript resolves the DOM `Text`
   (6 errors), and `initializeOpenRequests` passes `editor.state.doc` to
   `attachText(text: string)`. Restore the type import and pass a string.
   `npm run typecheck` must exit 0.

2. **The chunked preview is not the same HTML as a full render (blocker).**
   Each blank-line chunk is rendered by markdown-it on its own, so anything
   that crosses a blank line breaks. Measured on this branch
   (`IncrementalRenderState(...).initial()` joined vs `renderMarkdown(all)`):
   - reference links: `See [the docs][d].` + `[d]: https://example.com` →
     the link is lost (also footnote-style `[^1]:` definitions);
   - loose lists: `1. one` / blank / `2. two` → three `<ol start>` lists
     instead of one loose list;
   - indented code with a blank line inside → two `<pre>` blocks;
   - edits: typing "```" at the top of a document turns only the first chunk
     into code; the rest still renders as headings and paragraphs.
   Expected: for any document and after any sequence of edits, the preview
   blocks joined in order equal `renderMarkdown(document)` (ignoring only the
   wrapper elements). Chunk boundaries must be top-level markdown-it block
   boundaries (the brief's "block-level token boundaries"), not blank lines;
   reference definitions apply document-wide (pass them through markdown-it
   `env`, and re-render the blocks that use a definition when it changes);
   an edit re-parses from the changed block until the new token stream lines
   up with the old boundaries again (an opened fence runs to the end).
   Tests (AC-R1-10): the four cases above as exact unit tests; a seeded
   property test (≥ 500 seeds) over the golden render corpus documents with
   random inserts/deletes (including "```", "    ", "[x]: u", list markers
   and blank lines) asserting equality with the full render after every
   step; keep the counting-parser test (re-parse count stays a small
   constant for an edit inside one paragraph).

3. **Delta consistency (major, untested).** Patch and append results are
   deltas; a dropped or reordered delta leaves the preview wrong for good.
   Add a unit property test driving `RenderWorkerHandler` and
   `wireRenderWorker` together (real modules, no mocks of ours) through
   seeded interleavings of edits, render requests, fill ticks, a failed
   render, a resync and a new epoch: after the queue drains, the preview's
   `.preview-block` HTML in order equals the sanitised full render of the
   renderer's current version.

4. **Stale `data-line` after a line-count change (major).** When lines are
   inserted above a block, its wrapper `data-line` and the inner `data-line`
   attributes keep their old numbers (only re-rendered blocks get new ones).
   Scroll sync will rely on them. Make the line of every block correct after
   any edit without touching every block's DOM per keystroke (for example a
   per-page/section offset, or resolving lines from the worker's chunk table
   on demand). Test: insert two lines at the top, then every rendered
   block's line (as the app reads it) equals the full render's `data-line`.

5. **Tests assume a flat preview, the code nests pages/sections (blocker).**
   Keep the section/page nesting. Update the three assertions in
   `test/unit/preview.test.ts` and the two `#preview > .preview-block`
   selectors in `test/e2e/preview.spec.ts` (AC-R1-09) to read
   `.preview-block` descendants. Also keep `blocksInPage`/`pagesInSection`
   right after `insertPatch`/`removeBlocks`, or say in a one-line comment why
   uneven pages are acceptable.

6. **20 MB documents freeze the window (blocker: AC-PERF-09/10/11).**
   On the Raspberry Pi precheck, after opening the 20 MB file the editor is
   not clickable within 30 s (AC-PERF-10), `renderComplete` never turns true
   (AC-PERF-09), and the first preview took 1625 ms (AC-PERF-11). Known
   whole-document work per keystroke in the worker: `patch()` walks every
   chunk up to the cursor, the `complete` getter walks all chunks, the
   line-shift loop in `applyChange` walks all following chunks, and
   `documentLines` copies the whole text. Make the per-keystroke work
   proportional to the change (AGENTS.md: no whole-document copy or
   `toString()` on the per-keystroke path). Then profile the main thread
   during open (CodeMirror load, the fill pass's append flood, per-block
   sanitise) and fix what blocks input; the fill pass must yield to input.
   AC-PERF-11's wording is "when the file loads": time it from the open
   request, not from application launch (start the app first, then open the
   file through the same path a user takes), and say so in a one-line
   comment. Do not change any budget, timeout, sample count or threshold.
   If the Pi still misses a budget after the fix, report the distributions;
   the reviewer decides.

7. **Delete `test/e2e/debug-scroll.spec.ts`** (no assertions, a timing probe).

## Allowed files
src/renderer/**, src/shared/**, test/unit/**, test/e2e/**. Nothing else.

## Done means
typecheck, check:deps, test:unit, check:coverage, build exit 0 — paste;
list files; red evidence per finding (the test failing on the current branch
code, then passing); e2e perf distributions for AC-PERF-02/07/08/09/10/11;
name any e2e test you could not run.
