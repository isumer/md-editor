import DOMPurify from "dompurify";

// DOMPurify's default URI policy plus the document-asset scheme. The hook below
// narrows that scheme to image sources so links cannot use it.
const ALLOWED_URI =
  /^(?:doc-asset:|(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;
const DOC_ASSET_URL = /^\s*doc-asset:/i;

DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
  if (!DOC_ASSET_URL.test(data.attrValue)) {
    return;
  }
  const attribute = data.attrName.toLowerCase();
  const imageSource = node.nodeName.toLowerCase() === "img" &&
    (attribute === "src" || attribute === "srcset");
  if (!imageSource) {
    data.keepAttr = false;
  }
});

export function sanitizeRenderedHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOW_DATA_ATTR: true,
    ADD_ATTR: ["data-line"],
    ALLOWED_URI_REGEXP: ALLOWED_URI,
    FORBID_TAGS: ["style", "link", "meta", "base", "form"],
  });
}

export function sanitizeRenderedHtmlBatch(html: readonly string[]): string[] {
  const batch = document.createElement("div");
  const containers = html.map((value) => {
    const container = document.createElement("div");
    const template = document.createElement("template");
    template.innerHTML = value;
    container.append(template.content);
    batch.append(container);
    return container;
  });
  DOMPurify.sanitize(batch, {
    ALLOW_DATA_ATTR: true,
    ADD_ATTR: ["data-line"],
    ALLOWED_URI_REGEXP: ALLOWED_URI,
    FORBID_TAGS: ["style", "link", "meta", "base", "form"],
    IN_PLACE: true,
  });
  return containers.map((container) => container.innerHTML);
}
