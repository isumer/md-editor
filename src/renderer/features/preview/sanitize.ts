import DOMPurify, { type Config, type DOMPurify as Purifier } from "dompurify";

// DOMPurify's default URI policy plus the document-asset scheme. The hook below
// narrows that scheme to image sources so links cannot use it.
const ALLOWED_URI =
  /^(?:doc-asset:|(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;
const DOC_ASSET_URL = /^\s*doc-asset:/i;
const HAS_DOC_ASSET_URL = /doc-asset:/i;

const SANITIZE_CONFIG: Config = {
  ALLOW_DATA_ATTR: true,
  ADD_ATTR: ["data-line"],
  ALLOWED_URI_REGEXP: ALLOWED_URI,
  FORBID_TAGS: ["style", "link", "meta", "base", "form"],
};

function configure(purifier: Purifier, config: Config, restrictDocAssets: boolean): void {
  if (restrictDocAssets) {
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
  }
  purifier.setConfig(config);
}

// DOMPurify ignores per-call settings after setConfig, so the string and
// fragment forms use separately configured instances.
const purifier = DOMPurify(window);
const docAssetPurifier = DOMPurify(window);
const fragmentPurifier = DOMPurify(window);
configure(purifier, SANITIZE_CONFIG, false);
configure(docAssetPurifier, SANITIZE_CONFIG, true);
configure(fragmentPurifier, { ...SANITIZE_CONFIG, RETURN_DOM_FRAGMENT: true }, true);

export function sanitizeRenderedHtml(html: string): string {
  return HAS_DOC_ASSET_URL.test(html)
    ? docAssetPurifier.sanitize(html)
    : purifier.sanitize(html);
}

export const sanitizeRenderedFragment = fragmentPurifier.sanitize as unknown as (
  html: string,
) => DocumentFragment;
