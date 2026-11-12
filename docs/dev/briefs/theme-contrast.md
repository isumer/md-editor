# Theme contrast: every text is readable in light and dark

Owner report (2026-11-13): the text in the left workspace sidebar cannot be read.

## Root cause (found by Jarvis)
`src/renderer/styles.css` sets `#workspace-sidebar { background: #f6f8fa }`, a light-theme
colour, with no dark variant. The text inherits the theme colour (`#e6edf3` in dark), so in
dark mode light text sits on a light background. `.workspace-row:hover` (`#d8dee4`) and the
border (`#d0d7de`) have the same problem. There are 57 fixed hex colours outside the theme
blocks, in `styles.css`, `features/compare/compare.css` and `features/merge/merge.css`.

## Scope
1. Chrome colours become theme tokens. Each theme block (`:root`, the dark media query,
   `[data-theme="light"]`, `[data-theme="dark"]`) defines them: surface background, surface
   text, muted text, hover, selection, border, and the compare/merge add/remove/change
   colours. No component CSS keeps a fixed colour for text, background or border.
2. Contrast floor (WCAG 2.2 AA): normal text 4.5:1, large text (≥ 24 px, or ≥ 18.66 px
   bold) 3:1, focus outlines and borders that carry meaning 3:1 against their background.
3. A user-picked editor or preview background (R07) keeps working as it does now.

## Test (blocking, no new dependency)
- Unit: every theme token pair (text on its background, hover and selection included)
  meets the floor. Use `contrastRatio` in `src/shared/settings/appearance.ts`.
- e2e, in light and in dark: open a workspace folder, a document, compare and merge views.
  For every visible element with its own text node, compute its colour and its effective
  background (walk up to the first non-transparent ancestor), and assert the floor. The
  failure message names the element, both colours and the ratio. Also check one hovered
  sidebar row and one selected row.
- Mutation: set the sidebar background back to `#f6f8fa`; the dark e2e must go red.

## Not in scope
New themes, colour pickers, or a visual redesign. Keep the light theme's look as it is now.
