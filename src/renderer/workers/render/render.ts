import hljs from "highlight.js/lib/common";
import MarkdownIt from "markdown-it";

const HIGHLIGHT_CACHE_ENTRY_LIMIT = 64;
const HIGHLIGHT_CACHE_VALUE_LIMIT = 64 * 1024;
// Incremental renders revisit unchanged fences, so retain only small recent results.
const highlightCache = new Map<string, string>();

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function highlightCode(source: string, language: string): string {
  if (source.length > HIGHLIGHT_CACHE_VALUE_LIMIT) {
    return hljs.highlight(source, { language, ignoreIllegals: true }).value;
  }
  const key = `${language}\0${source}`;
  const cached = highlightCache.get(key);
  if (cached !== undefined) {
    highlightCache.delete(key);
    highlightCache.set(key, cached);
    return cached;
  }
  const html = hljs.highlight(source, { language, ignoreIllegals: true }).value;
  if (html.length > HIGHLIGHT_CACHE_VALUE_LIMIT) {
    return html;
  }
  if (highlightCache.size >= HIGHLIGHT_CACHE_ENTRY_LIMIT) {
    for (const oldest of highlightCache.keys()) {
      highlightCache.delete(oldest);
      break;
    }
  }
  highlightCache.set(key, html);
  return html;
}

function createMarkdownRenderer() {
  const markdown = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
    highlight(source, language) {
      if (language && hljs.getLanguage(language)) {
        const highlighted = highlightCode(source, language);
        return `<pre><code class="hljs language-${escapeHtml(language)}">${highlighted}</code></pre>`;
      }
      return `<pre><code class="hljs">${escapeHtml(source)}</code></pre>`;
    },
  });

  markdown.core.ruler.after("block", "source-lines", (state) => {
    const prefix = typeof state.env["dataLinePrefix"] === "string"
      ? state.env["dataLinePrefix"]
      : "";
    for (const token of state.tokens) {
      if (token.block && token.nesting === 1 && token.map) {
        token.attrSet("data-line", `${prefix}${String(token.map[0])}`);
      }
    }
  });

  markdown.core.ruler.after("inline", "task-list-checkboxes", (state) => {
    let listItemDepth = 0;
    for (const token of state.tokens) {
      if (token.type === "list_item_open") {
        listItemDepth += 1;
        continue;
      }
      if (token.type === "list_item_close") {
        listItemDepth -= 1;
        continue;
      }
      if (token.type !== "inline" || listItemDepth === 0 || !token.children) {
        continue;
      }

      const firstChild = token.children[0];
      if (!firstChild || firstChild.type !== "text") {
        continue;
      }
      const match = /^\[([ xX])\]\s+/.exec(firstChild.content);
      if (!match) {
        continue;
      }

      firstChild.content = firstChild.content.slice(match[0].length);
      const checkbox = new state.Token("html_inline", "", 0);
      checkbox.content = `<input type="checkbox" disabled${match[1]?.toLowerCase() === "x" ? " checked" : ""}> `;
      token.children.unshift(checkbox);
    }
  });

  return markdown;
}

const markdown = createMarkdownRenderer();

export interface ReferenceDefinition {
  title: string;
  href: string;
}

// Reference definitions are document-wide in Markdown, but chunks render in
// isolation. Collect them from every chunk and pass the merged map through
// markdown-it's environment so a chunk can resolve links defined elsewhere.
export interface RenderEnvironment {
  [key: string | symbol]: unknown;
  references?: Record<string, ReferenceDefinition>;
}

export function renderMarkdown(source: string, env: RenderEnvironment = {}): string {
  return markdown.render(source, env);
}

export function collectReferences(source: string): Record<string, ReferenceDefinition> {
  // markdown-it's normalize rule rewrites CRLF and lone CR before block
  // parsing; calling the block rule directly skips it, so do the same here.
  const normalized = source.replace(/\r\n?|\n/g, "\n");
  const env: RenderEnvironment = {};
  markdown.block.parse(normalized, markdown, env, []);
  return env.references ?? {};
}
