import type { ExportBlock } from "./html";

const BLOCK_SELECTOR = ".preview-block[data-block-id]";
const BLOCK_HTML_EVENT = "solidmd:preview-block-html";
const CACHE_UPDATED_EVENT = "solidmd:export-cache-updated";

interface BlockHtmlDetail {
  element: HTMLElement;
  html: string;
}

function relativeAssets(html: string): string {
  return html.replaceAll(/<img\b[^>]*>/giu, (image) =>
    image.replaceAll(/doc-asset:\/\/[^/]+\/[^/]+\//g, ""));
}

function collectBlocks(node: Node, blocks: Set<HTMLElement>): void {
  if (!(node instanceof HTMLElement)) return;
  if (node.matches(BLOCK_SELECTOR)) {
    blocks.add(node);
    return;
  }
  for (const child of node.children) collectBlocks(child, blocks);
}

function lastBlock(node: Element): HTMLElement | null {
  if (node instanceof HTMLElement && node.matches(BLOCK_SELECTOR)) return node;
  for (let child = node.lastElementChild; child; child = child.previousElementSibling) {
    const block = lastBlock(child);
    if (block) return block;
  }
  return null;
}

function previousBlock(element: HTMLElement, root: HTMLElement): HTMLElement | null {
  let current: Element | null = element;
  while (current && current !== root) {
    for (let sibling = current.previousElementSibling; sibling;
      sibling = sibling.previousElementSibling) {
      const block = lastBlock(sibling);
      if (block) return block;
    }
    current = current.parentElement;
  }
  return null;
}

export class PreviewExportCache {
  private readonly htmlById = new Map<string, string>();
  private readonly htmlByElement = new WeakMap<HTMLElement, string>();
  private readonly order: string[] = [];
  private readonly observer: MutationObserver;

  constructor(private readonly preview: HTMLElement) {
    const initial = new Set<HTMLElement>();
    collectBlocks(preview, initial);
    for (const block of initial) {
      this.htmlByElement.set(block, relativeAssets(block.innerHTML));
      this.upsert(block);
    }
    document.addEventListener(BLOCK_HTML_EVENT, (event) =>
      this.recordHtml(event as CustomEvent<BlockHtmlDetail>));
    this.observer = new MutationObserver((records) => this.apply(records));
    this.observer.observe(preview, { childList: true, subtree: true });
  }

  snapshot(): readonly ExportBlock[] {
    return this.order.map((id) => ({
      id,
      html: this.htmlById.get(id) as string,
    }));
  }

  private apply(records: readonly MutationRecord[]): void {
    const removed = new Set<HTMLElement>();
    const added = new Set<HTMLElement>();
    for (const record of records) {
      for (const node of record.removedNodes) collectBlocks(node, removed);
      for (const node of record.addedNodes) collectBlocks(node, added);
    }
    for (const block of removed) this.remove(block.dataset["blockId"] as string);
    for (const block of added) this.upsert(block);
  }

  private recordHtml(event: CustomEvent<BlockHtmlDetail>): void {
    const { element, html: renderedHtml } = event.detail;
    const start = performance.now();
    const html = relativeAssets(renderedHtml);
    this.htmlByElement.set(element, html);
    if (!this.preview.contains(element)) return;
    const id = element.dataset["blockId"] as string;
    this.htmlById.set(id, html);
    performance.clearMeasures("preview-export-cache");
    performance.measure("preview-export-cache", { start, end: performance.now() });
    this.notifyUpdated(id);
  }

  private remove(id: string): void {
    this.htmlById.delete(id);
    const index = this.order.indexOf(id);
    if (index >= 0) this.order.splice(index, 1);
  }

  private upsert(block: HTMLElement): void {
    const id = block.dataset["blockId"] as string;
    const html = this.htmlByElement.get(block);
    if (html === undefined) return;
    this.remove(id);
    const previousId = previousBlock(block, this.preview)?.dataset["blockId"];
    const previousIndex = previousId === undefined ? -1 : this.order.indexOf(previousId);
    this.order.splice(previousIndex + 1, 0, id);
    this.htmlById.set(id, html);
    this.notifyUpdated(id);
  }

  private notifyUpdated(id: string): void {
    this.preview.dispatchEvent(new CustomEvent(CACHE_UPDATED_EVENT, { detail: { id } }));
  }
}
