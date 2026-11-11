import DOMPurify from "dompurify";

// DOMPurify's default URI policy plus the document-asset scheme. The hook below
// narrows that scheme to image sources so links cannot use it.
const ALLOWED_URI =
  /^(?:doc-asset:|(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;
const DOC_ASSET_URL = /^\s*doc-asset:/i;

// A private instance configured once: a config object passed to sanitize() is
// re-parsed on every call (default tag and attribute sets cloned each time),
// which cost 1–3 ms per preview block regardless of its size and pushed the
// 20 MB first screen past the 100 ms main-thread budget on slow runners.
const purifier = DOMPurify(window);

purifier.addHook("uponSanitizeAttribute", (node, data) => {
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

purifier.setConfig({
  ALLOW_DATA_ATTR: true,
  ADD_ATTR: ["data-line"],
  ALLOWED_URI_REGEXP: ALLOWED_URI,
  FORBID_TAGS: ["style", "link", "meta", "base", "form"],
});

export function sanitizeRenderedHtml(html: string): string {
  return purifier.sanitize(html);
}
