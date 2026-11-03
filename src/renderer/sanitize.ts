import DOMPurify from "dompurify";

export function sanitizeRenderedHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOW_DATA_ATTR: true,
    ADD_ATTR: ["data-line"],
    FORBID_TAGS: ["style", "link", "meta", "base", "form"],
  });
}
