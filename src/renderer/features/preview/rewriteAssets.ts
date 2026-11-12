export interface AssetRewriteContext {
  windowId: number | null;
  grant: string | null;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const ATTRIBUTE =
  /(\s+)([^\s=/>]+)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;

function isRelativeUrl(value: string): boolean {
  const url = value.trim();
  return url.length > 0 && !SCHEME.test(url) && !url.startsWith("/") &&
    !url.startsWith("\\") && !url.startsWith("#") && !url.startsWith("?");
}

function assetUrl(prefix: string, value: string): string {
  const hashIndex = value.indexOf("#");
  const beforeHash = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : value.slice(hashIndex);
  const queryIndex = beforeHash.indexOf("?");
  const path = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : beforeHash.slice(queryIndex);
  return `${prefix}${path}${query}${hash}`;
}

interface SrcsetCandidate {
  url: string;
  descriptor: string;
}

function parseSrcset(value: string): SrcsetCandidate[] {
  const candidates: SrcsetCandidate[] = [];
  let index = 0;
  while (index < value.length) {
    while (index < value.length &&
      (value[index] === "," || /\s/.test(value[index] ?? ""))) {
      index += 1;
    }
    if (index >= value.length) {
      break;
    }
    const urlStart = index;
    while (index < value.length && !/\s/.test(value[index] ?? "")) {
      index += 1;
    }
    let url = value.slice(urlStart, index);
    let descriptor = "";
    if (url.endsWith(",")) {
      url = url.replace(/,+$/, "");
    } else {
      while (index < value.length && /\s/.test(value[index] ?? "")) {
        index += 1;
      }
      const descriptorStart = index;
      while (index < value.length && value[index] !== ",") {
        index += 1;
      }
      descriptor = value.slice(descriptorStart, index).trim();
      if (value[index] === ",") {
        index += 1;
      }
    }
    candidates.push({ url, descriptor });
  }
  return candidates;
}

function formatSrcset(candidate: SrcsetCandidate): string {
  return candidate.descriptor === ""
    ? candidate.url
    : `${candidate.url} ${candidate.descriptor}`;
}

function rewriteSrcset(value: string, prefix: string): string {
  let changed = false;
  const candidates = parseSrcset(value).map((candidate) => {
    if (!isRelativeUrl(candidate.url)) {
      return candidate;
    }
    changed = true;
    return {
      url: assetUrl(prefix, candidate.url.trim()),
      descriptor: candidate.descriptor,
    };
  });
  return changed ? candidates.map(formatSrcset).join(", ") : value;
}

function rewriteAttributes(tag: string, prefix: string): string {
  return tag.replace(ATTRIBUTE, (
    match,
    leading: string,
    name: string,
    equals: string,
    doubleQuoted: string | undefined,
    singleQuoted: string | undefined,
    unquoted: string | undefined,
  ) => {
    const attribute = name.toLowerCase();
    if (attribute !== "src" && attribute !== "srcset") {
      return match;
    }
    const value = doubleQuoted ?? singleQuoted ?? unquoted ?? "";
    const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : "";
    const rewritten = attribute === "src"
      ? isRelativeUrl(value) ? assetUrl(prefix, value.trim()) : value
      : rewriteSrcset(value, prefix);
    return `${leading}${name}${equals}${quote}${rewritten}${quote}`;
  });
}

function rewriteImageTags(html: string, prefix: string): string {
  const tagStart = /<img\b/gi;
  let output = "";
  let index = 0;
  for (;;) {
    tagStart.lastIndex = index;
    const match = tagStart.exec(html);
    if (!match) {
      return output + html.slice(index);
    }
    const start = match.index;
    let cursor = start + match[0].length;
    let quote: string | null = null;
    while (cursor < html.length) {
      const character = html[cursor];
      if (quote !== null) {
        quote = character === quote ? null : quote;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        break;
      }
      cursor += 1;
    }
    if (cursor >= html.length) {
      return output + html.slice(index);
    }
    output += html.slice(index, start) + rewriteAttributes(
      html.slice(start, cursor + 1),
      prefix,
    );
    index = cursor + 1;
  }
}

export function rewriteAssetUrls(
  html: string,
  context: AssetRewriteContext,
): string {
  if (context.windowId === null || context.grant === null || context.grant === "") {
    return html;
  }
  return rewriteImageTags(
    html,
    `doc-asset://${String(context.windowId)}/${context.grant}/`,
  );
}

export function rewriteAssetFragment(
  fragment: DocumentFragment,
  context: AssetRewriteContext,
): void {
  if (context.windowId === null || context.grant === null || context.grant === "") {
    return;
  }
  const prefix = `doc-asset://${String(context.windowId)}/${context.grant}/`;
  for (const image of fragment.querySelectorAll("img")) {
    const source = image.getAttribute("src");
    if (source !== null && isRelativeUrl(source)) {
      image.setAttribute("src", assetUrl(prefix, source.trim()));
    }
    const sourceSet = image.getAttribute("srcset");
    if (sourceSet !== null) {
      image.setAttribute("srcset", rewriteSrcset(sourceSet, prefix));
    }
  }
}

export const rewriteAssets = rewriteAssetUrls;
