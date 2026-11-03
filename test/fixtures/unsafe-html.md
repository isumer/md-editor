# Unsafe HTML

<script>globalThis.markdownScriptRan = true</script>

<style>body{display:none}</style>

<link rel="stylesheet" href="https://example.com/unsafe.css">
<meta http-equiv="refresh" content="0;url=https://example.com/">
<base href="https://example.com/">

<img src=x onerror="globalThis.markdownImageErrorRan = true">

<form action="https://example.com/"><input name="leak"></form>

<p id="inline-style" style="color: red">Inline style stays</p>

<a id="location">DOM clobbering guard</a>
