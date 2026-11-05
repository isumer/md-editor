# Export fixture: raw HTML that must be sanitised

The export runs the same sanitiser as the preview: everything active is
removed, everything inert is kept.

<script>globalThis.exportScriptCanary = true;</script>

<style>body { display: none; }</style>

<link rel="stylesheet" href="https://example.com/unsafe.css">

<meta http-equiv="refresh" content="0;url=https://example.com/">

<base href="https://example.com/">

<iframe src="https://example.com/frame" title="An iframe"></iframe>

<img src="https://example.com/pixel.png" onerror="globalThis.exportImageCanary = true" alt="tracking pixel">

<a href="javascript:globalThis.exportLinkCanary = true">A script link</a>

<svg width="16" height="16" onload="globalThis.exportSvgCanary = true"><circle cx="8" cy="8" r="7"></circle></svg>

<form action="https://example.com/collect">
  <input name="token" value="secret">
  <button type="submit">Send</button>
</form>

## Markup that must survive

<details>
  <summary>A collapsed note</summary>
  <p>The details content is inert and stays.</p>
</details>

<p id="inline-style" style="color: rebeccapurple">Inline style and data attributes stay.</p>

<div data-line="0" data-note="kept">A div with data attributes stays.</div>

## Markdown after the raw HTML

Normal **Markdown** keeps rendering.
