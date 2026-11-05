import type {
  RenderBlock,
  RenderBlockPatch,
  RenderResponse,
  RenderResync,
  RenderResult,
} from "../../../shared/workers/render";
import { formatMessage } from "../../../shared/messages/en";
import type { ReplicatedVersion } from "../../core/replication";
import { openExternal } from "../../platform/api";
import { RenderScheduler } from "./renderScheduler";
import { sanitizeRenderedHtml } from "./sanitize";

export interface RenderWorkerEvents {
  onmessage: ((event: MessageEvent<RenderResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

interface RenderWorkerWiring {
  scheduler: RenderScheduler;
  preview: HTMLElement;
  showStatus(message?: string): void;
  currentVersion(): ReplicatedVersion;
  onResync(response: RenderResync): void;
  rewriteHtml(html: string): string;
}

type BlockElements = Map<string, HTMLDivElement>;

const BLOCK_CLASS = "preview-block";
// Blocks are packed into pages and pages into sections so content-visibility
// skips whole regions without one containment decision per block: the cost of
// re-checking containing elements grows with their count, so a flat list of
// one wrapper per block makes scrolling slower as the document gets larger.
const PAGE_BLOCK_LIMIT = 10;
const SECTION_PAGE_LIMIT = 50;

interface BlockLayout {
  section: HTMLDivElement | null;
  page: HTMLDivElement | null;
  blocksInPage: number;
  pagesInSection: number;
}

function resetLayout(layout: BlockLayout): void {
  layout.section = null;
  layout.page = null;
  layout.blocksInPage = 0;
  layout.pagesInSection = 0;
}

function placeBlock(
  element: HTMLDivElement,
  wiring: RenderWorkerWiring,
  layout: BlockLayout,
): void {
  if (layout.page === null || layout.blocksInPage >= PAGE_BLOCK_LIMIT) {
    if (layout.section === null || layout.pagesInSection >= SECTION_PAGE_LIMIT) {
      const section = document.createElement("div");
      section.className = "preview-section";
      wiring.preview.append(section);
      layout.section = section;
      layout.pagesInSection = 0;
    }
    const page = document.createElement("div");
    page.className = "preview-page";
    (layout.section as HTMLDivElement).append(page);
    layout.page = page;
    layout.pagesInSection += 1;
    layout.blocksInPage = 0;
  }
  (layout.page as HTMLDivElement).append(element);
  layout.blocksInPage += 1;
}

function createBlock(block: RenderBlock, wiring: RenderWorkerWiring): HTMLDivElement {
  const element = document.createElement("div");
  element.className = BLOCK_CLASS;
  element.dataset["blockId"] = block.id;
  updateBlock(element, block, wiring);
  return element;
}

function updateBlock(
  element: HTMLDivElement,
  block: RenderBlock,
  wiring: RenderWorkerWiring,
): void {
  element.dataset["line"] = String(block.startLine);
  element.innerHTML = wiring.rewriteHtml(sanitizeRenderedHtml(block.html));
}

function appendBlocks(
  blocks: readonly RenderBlock[],
  wiring: RenderWorkerWiring,
  elements: BlockElements,
  layout: BlockLayout,
): void {
  const start = performance.now();
  for (const block of blocks) {
    const element = createBlock(block, wiring);
    elements.set(block.id, element);
    placeBlock(element, wiring, layout);
  }
  performance.measure("preview-patch", { start, end: performance.now() });
}

function replaceBlocks(
  blocks: readonly RenderBlock[],
  wiring: RenderWorkerWiring,
  elements: BlockElements,
  layout: BlockLayout,
): void {
  elements.clear();
  wiring.preview.replaceChildren();
  resetLayout(layout);
  appendBlocks(blocks, wiring, elements, layout);
}

function removeElement(element: HTMLDivElement, layout: BlockLayout): void {
  const page = element.parentElement;
  element.remove();
  if (!page || page.classList.contains("preview-page") === false ||
    page.childElementCount > 0) {
    return;
  }
  const section = page.parentElement;
  page.remove();
  if (layout.page === page) {
    layout.page = null;
    layout.blocksInPage = 0;
  }
  if (section && section.classList.contains("preview-section") &&
    section.childElementCount === 0) {
    section.remove();
    if (layout.section === section) {
      layout.section = null;
      layout.pagesInSection = 0;
    }
  }
}

function removeBlocks(
  removed: readonly string[],
  elements: BlockElements,
  layout: BlockLayout,
): void {
  for (const id of removed) {
    const element = elements.get(id);
    if (element) {
      removeElement(element, layout);
    }
    elements.delete(id);
  }
}

function insertPatch(
  patch: RenderBlockPatch,
  wiring: RenderWorkerWiring,
  elements: BlockElements,
  layout: BlockLayout,
): void {
  const existing = elements.get(patch.block.id);
  if (existing) {
    updateBlock(existing, patch.block, wiring);
    return;
  }
  const element = createBlock(patch.block, wiring);
  const anchor = patch.after === null ? null : elements.get(patch.after) ?? null;
  if (anchor) {
    anchor.after(element);
  } else if (patch.after === null) {
    const first = wiring.preview.querySelector<HTMLDivElement>(".preview-page")
      ?.firstElementChild ?? null;
    if (first) {
      first.before(element);
    } else {
      placeBlock(element, wiring, layout);
    }
  } else {
    placeBlock(element, wiring, layout);
  }
  elements.set(patch.block.id, element);
}

function patchBlocks(
  blocks: readonly RenderBlockPatch[],
  removed: readonly string[],
  wiring: RenderWorkerWiring,
  elements: BlockElements,
  layout: BlockLayout,
): void {
  const start = performance.now();
  removeBlocks(removed, elements, layout);
  for (const patch of blocks) {
    insertPatch(patch, wiring, elements, layout);
  }
  performance.measure("preview-patch", { start, end: performance.now() });
}

function applyBlocks(
  result: RenderResult & { ok: true },
  wiring: RenderWorkerWiring,
  elements: BlockElements,
  layout: BlockLayout,
): void {
  if (result.mode === "replace") {
    replaceBlocks(result.blocks, wiring, elements, layout);
  } else if (result.mode === "append") {
    appendBlocks(result.blocks, wiring, elements, layout);
  } else {
    patchBlocks(result.blocks, result.removed, wiring, elements, layout);
  }
  wiring.preview.dataset["renderComplete"] = String(result.complete);
}

function applyRenderResult(
  result: RenderResult,
  wiring: RenderWorkerWiring,
  elements: BlockElements,
  layout: BlockLayout,
): void {
  wiring.scheduler.applyResult(result.id, result, (appliedResponse) => {
    if (appliedResponse.ok) {
      applyBlocks(appliedResponse, wiring, elements, layout);
      wiring.showStatus();
    } else {
      wiring.showStatus(appliedResponse.message);
    }
  });
}

export function wireRenderWorker(
  renderWorker: RenderWorkerEvents,
  wiring: RenderWorkerWiring,
): void {
  const elements: BlockElements = new Map();
  const layout: BlockLayout = {
    section: null,
    page: null,
    blocksInPage: 0,
    pagesInSection: 0,
  };
  // Patch results are ordered deltas, so a result is stale only once a newer
  // version has actually been shown; comparing against the live editor version
  // would discard a delta the preview still needs.
  let shown: { docId: string; epoch: number; version: number } | null = null;

  renderWorker.onmessage = (event: MessageEvent<RenderResponse>) => {
    const response = event.data;
    const current = wiring.currentVersion();
    if (response.docId !== current.docId || response.epoch !== current.epoch) {
      return;
    }
    if ("op" in response) {
      wiring.onResync(response);
      return;
    }
    if (response.version > current.version) {
      return;
    }
    if (shown !== null && shown.docId === response.docId &&
      shown.epoch === response.epoch && response.version < shown.version) {
      return;
    }
    applyRenderResult(response, wiring, elements, layout);
    if (response.ok) {
      shown = {
        docId: response.docId,
        epoch: response.epoch,
        version: response.version,
      };
    }
  };

  renderWorker.onerror = (event) => {
    wiring.showStatus(event.message || "The preview worker failed");
  };
}

export function wirePreviewLinks(
  preview: HTMLElement,
  showStatus: (message?: string) => void,
): void {
  function handlePreviewLink(event: MouseEvent): void {
    if (event.type === "auxclick" && event.button !== 1) {
      return;
    }
    const link = event.target instanceof Element
      ? event.target.closest<HTMLAnchorElement>("a[href]")
      : null;
    const href = link?.getAttribute("href");
    if (!href) {
      return;
    }

    event.preventDefault();
    if (href.startsWith("#")) {
      if (href === "#") {
        preview.scrollTo({ top: 0 });
        return;
      }

      let id: string;
      try {
        id = decodeURIComponent(href.slice(1));
      } catch {
        return;
      }
      const target = Array.from(preview.querySelectorAll<HTMLElement>("[id]"))
        .find((element) => element.id === id);
      target?.scrollIntoView();
      return;
    }

    let protocol: string;
    try {
      protocol = new URL(href).protocol;
    } catch {
      showStatus(`Cannot open link: ${href}`);
      return;
    }
    if (protocol !== "http:" && protocol !== "https:" && protocol !== "mailto:") {
      showStatus(`Cannot open link: ${href}`);
      return;
    }

    void openExternal(href).then((result) => {
      if (!result.ok) {
        showStatus(formatMessage(result.error.messageKey, result.error.params));
      }
    }).catch((error) => {
      showStatus(error instanceof Error ? error.message : String(error));
    });
  }

  preview.addEventListener("click", handlePreviewLink);
  preview.addEventListener("auxclick", handlePreviewLink);
}
