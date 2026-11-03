import hljs from "highlight.js";
import MarkdownIt from "markdown-it";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function createMarkdownRenderer() {
  const markdown = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
    highlight(source, language) {
      if (language && hljs.getLanguage(language)) {
        const highlighted = hljs.highlight(source, {
          language,
          ignoreIllegals: true,
        }).value;
        return `<pre><code class="hljs language-${escapeHtml(language)}">${highlighted}</code></pre>`;
      }
      return `<pre><code class="hljs">${escapeHtml(source)}</code></pre>`;
    },
  });

  markdown.core.ruler.after("block", "source-lines", (state) => {
    for (const token of state.tokens) {
      if (token.block && token.nesting === 1 && token.map) {
        token.attrSet("data-line", String(token.map[0]));
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

export function renderMarkdown(source: string): string {
  return markdown.render(source);
}
