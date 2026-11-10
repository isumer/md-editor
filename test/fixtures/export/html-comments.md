# HTML Comments Document

First paragraph before any comment.

<!-- This is a Markdown comment between paragraphs. It must not appear in the exported HTML. -->

Second paragraph after the first comment.

<!--
Another comment that spans
multiple lines.
-->

Third paragraph after a multi-line comment.

<img src="x" onerror="alert(1)">

Fourth paragraph after a raw HTML tag that the sanitiser must clean. The `onerror` attribute and any script content must be removed.

<!-- Final comment at the end -->

Last paragraph.
