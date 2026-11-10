# Entity and Code Document

## Entities in text

HTML entities in plain text: `&amp;`, `&lt;script&gt;`, `&gt;`, `&quot;`, `&copy;`, `&reg;`.

The ampersand entity `&amp;` must render as `&`. The less-than entity `&lt;script&gt;` must render as `<script>` in the exported text but must not execute.

## Entities in a fenced code block

```html
&amp; &lt;script&gt; &gt; &quot;
```

The entities inside the fenced block must stay literal and must not be decoded.

## More entities in text

Mixed: `&amp;` and `&lt;tag&gt;` together. Also `&nbsp;` and `&mdash;`.

## Final paragraph

End of document with `&amp;` one more time.
