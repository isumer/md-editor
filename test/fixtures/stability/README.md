Stability fixtures for slice 14 (hardening, PLAN "Slices" §14).
These small documents stress one renderer path each. Every file is under 4 KB,
plain ASCII, LF only, committed test data.

| File | Contents | Failure mode a test must assert |
| --- | --- | --- |
| `deep-nesting.md` | 200 nested blockquote levels (`>` repeated), then one paragraph. | Renderer must handle or cap deep nesting without crash. |
| `long-paragraph.md` | One paragraph of 20,000 ASCII words on one line. | Renderer must not freeze or crash on very long single line. |
| `many-links.md` | 1,000 reference-link uses of one definition plus 100 distinct definitions, one per line. | Renderer must process many reference links without slowdown or error. |
| `unclosed-fence.md` | Opening ```` ``` ```` fence with no closing fence, followed by 50 lines of text. | Sanitiser/renderer must not hang or crash on unclosed fence. |
| `html-heavy.md` | 200 inline `<span>` elements and one `<script>alert(1)</script>` element. | Sanitisation must drop the `<script>` and keep the `<span>` elements. |

All files: plain ASCII, LF only, no BOM, each under 4 KB. Do not invent extra files; do not touch `.gitattributes` or `.gitignore`.