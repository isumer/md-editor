// @vitest-environment jsdom

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { sanitizeRenderedHtml } from "../../src/renderer/features/preview/sanitize";
import { renderMarkdown } from "../../src/renderer/workers/render/render";

const GOLDEN_DIR = resolve(process.cwd(), "test/fixtures/golden");

const fixtures = [
  "readme-project",
  "long-note",
  "sanitise-html",
  "crlf-line-endings",
  "unicode-turkish-cjk",
  "headings-all-levels",
  "empty",
  "long-lines",
  "changelog",
  "api-reference",
] as const;

describe("golden render corpus", () => {
  for (const name of fixtures) {
    it(`renders ${name}.md to its reviewed HTML snapshot`, async () => {
      const markdown = await readFile(`${GOLDEN_DIR}/${name}.md`, "utf8");
      const html = sanitizeRenderedHtml(renderMarkdown(markdown));

      await expect(html).toMatchFileSnapshot(`${GOLDEN_DIR}/${name}.html`);
    });
  }
});
