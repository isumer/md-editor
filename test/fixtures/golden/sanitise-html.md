# Unsafe HTML

The preview must keep the safe markup and remove everything active.

<script>globalThis.goldenScriptRan = true;</script>

<style>body { display: none; }</style>

<iframe src="https://example.com/frame"></iframe>

<form action="https://example.com/collect">
  <input name="token" value="secret">
  <button type="submit">Send</button>
</form>

<img src="https://example.com/pixel.png" onerror="globalThis.goldenImageErrorRan = true" alt="tracking pixel">

<a href="javascript:globalThis.goldenLinkRan = true">Click me</a>

<a id="location" href="https://example.com/safe">Safe link</a>

<div style="border: 1px solid #ccc" data-line="0">
  <p>Inline style and data attributes are allowed.</p>
</div>

<details>
  <summary>Collapsed note</summary>
  <p>Details content remains visible when expanded.</p>
</details>

## After the raw HTML

Normal **Markdown** continues to render.
