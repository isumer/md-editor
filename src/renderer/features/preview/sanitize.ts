import DOMPurify from "dompurify";

// DOMPurify's default URI policy plus the document-asset scheme. The hook below
// narrows that scheme to image sources so links cannot use it.
const ALLOWED_URI =
  /^(?:doc-asset:|(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;
const DOC_ASSET_URL = /^\s*doc-asset:/i;

// A private instance configured once, so the hook and settings apply to every
// call without a config object being re-parsed per preview block.
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
