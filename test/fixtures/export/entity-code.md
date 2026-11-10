# Entity and Code Document

## Entities in text

HTML entities in plain text: `&`, `<script>`, `>`, `"`, `&copy;`, `&reg;`.

The ampersand entity `&` must render as `&`. The less-than entity `<script>` must render as `<script>` in the exported text but not execute.

## Entities in a fenced code block

```html
<div>& <script> > "</div>
```

The entities inside the fenced block must stay literal and not be decoded. The export must show `&` not `&amp;`.

## More entities in text

Mixed: `&` and `<tag>` together. Also `&nbsp;` and `&mdash;`.

## Final paragraph

End of document with `&` one more time.