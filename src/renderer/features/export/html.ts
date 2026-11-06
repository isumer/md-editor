export type ExportTheme = "light" | "dark" | "system";
export type ResolvedExportTheme = Exclude<ExportTheme, "system">;

export interface ExportBlock {
  id: string;
  html: string;
}

export interface HtmlExportInput {
  title: string;
  blocks: readonly ExportBlock[];
  theme: ExportTheme;
  alwaysLight: boolean;
  systemTheme?: ResolvedExportTheme;
}

const BASE_CSS = `
* { box-sizing: border-box; }
html { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
body { max-width: 980px; margin: 0 auto; padding: 32px; line-height: 1.55; }
body > :first-child { margin-top: 0; }
pre { overflow: auto; padding: 12px; border-radius: 6px; }
code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
img { max-width: 100%; }
input[type="checkbox"] { margin-right: 0.45em; }
.hljs-keyword, .hljs-selector-tag, .hljs-literal { color: #cf222e; }
.hljs-string, .hljs-title, .hljs-section { color: #0a3069; }
.hljs-comment, .hljs-quote { color: #6e7781; }
@page { margin: 0; }
@media print {
  body { max-width: none; padding: 0; }
  pre { white-space: pre-wrap; break-inside: avoid; }
  a { color: inherit; text-decoration: none; }
}`;

const LIGHT_CSS = `
:root { color-scheme: light; color: #1f2328; background: #ffffff; }
body { background: #ffffff; }
pre { background: #f6f8fa; }
code { color: #1f2328; }`;

const DARK_CSS = `
:root { color-scheme: dark; color: #e6edf3; background: #0d1117; }
body { background: #0d1117; }
pre { background: #161b22; }
code { color: #e6edf3; }
.hljs-keyword, .hljs-selector-tag, .hljs-literal { color: #ff7b72; }
.hljs-string, .hljs-title, .hljs-section { color: #a5d6ff; }
.hljs-comment, .hljs-quote { color: #8b949e; }`;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function resolvedTheme(input: HtmlExportInput): ResolvedExportTheme {
  if (input.alwaysLight) {
    return "light";
  }
  if (input.theme === "system") {
    return input.systemTheme ?? "light";
  }
  return input.theme;
}

export function buildExportHtml(input: HtmlExportInput): string {
  const themeCss = resolvedTheme(input) === "dark" ? DARK_CSS : LIGHT_CSS;
  const content = input.blocks.map((block) => block.html).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:">
<title>${escapeHtml(input.title)}</title>
<style>${BASE_CSS}\n${themeCss}</style>
</head>
<body>${content}</body>
</html>`;
}
