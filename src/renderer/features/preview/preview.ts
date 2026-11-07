import type {
  RenderBlock,
  RenderBlockPatch,
  RenderFillReadyMessage,
  RenderLineShift,
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
  postMessage(message: unknown): void;
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

interface LineShiftRecord extends RenderLineShift {
  version: number;
}

interface ShiftTable {
  root: HTMLElement;
  shifts: readonly LineShiftRecord[];
}

// Each block points at the live shift ledger of its preview, so resolving a
// line costs only the number of line-count changes since it was rendered.
const shiftTables = new WeakMap<HTMLElement, ShiftTable>();

const BLOCK_CLASS = "preview-block";
// Blocks are packed into pages and pages into sections so content-visibility
// skips whole regions without one containment decision per block: the cost of
// re-checking containing elements grows with their count, so a flat list of
// one wrapper per block makes scrolling slower as the document gets larger.
const PAGE_BLOCK_LIMIT = 10;
const SECTION_PAGE_LIMIT = 50;
// Patches insert into and remove from existing pages, so later pages can be
// uneven: content-visibility needs a bounded page size, not an even one.

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

function createBlock(
  block: RenderBlock,
  version: number,
  shifts: readonly LineShiftRecord[],
  wiring: RenderWorkerWiring,
): HTMLDivElement {
  const element = document.createElement("div");
  element.className = BLOCK_CLASS;
  element.dataset["blockId"] = block.id;
  updateBlock(element, block, version, shifts, wiring);
  return element;
}

function updateBlock(
  element: HTMLDivElement,
  block: RenderBlock,
  version: number,
  shifts: readonly LineShiftRecord[],
  wiring: RenderWorkerWiring,
): void {
  element.dataset["line"] = String(block.startLine);
  element.dataset["version"] = String(version);
  shiftTables.set(element, { root: wiring.preview, shifts });
  element.innerHTML = wiring.rewriteHtml(sanitizeRenderedHtml(block.html));
}

function appendBlocks(
  blocks: readonly RenderBlock[],
  version: number,
  shifts: readonly LineShiftRecord[],
  wiring: RenderWorkerWiring,
  elements: BlockElements,
  layout: BlockLayout,
): void {
  const start = performance.now();
  for (const block of blocks) {
    const element = createBlock(block, version, shifts, wiring);
    elements.set(block.id, element);
    placeBlock(element, wiring, layout);
  }
  performance.measure("preview-append", { start, end: performance.now() });
}

function replaceBlocks(
  blocks: readonly RenderBlock[],
  version: number,
  shifts: readonly LineShiftRecord[],
  wiring: RenderWorkerWiring,
  elements: BlockElements,
  layout: BlockLayout,
): void {
  elements.clear();
  wiring.preview.replaceChildren();
  resetLayout(layout);
  appendBlocks(blocks, version, shifts, wiring, elements, layout);
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
  version: number,
  shifts: readonly LineShiftRecord[],
  wiring: RenderWorkerWiring,
  elements: BlockElements,
  layout: BlockLayout,
): void {
  const existing = elements.get(patch.block.id);
  if (existing) {
    updateBlock(existing, patch.block, version, shifts, wiring);
    return;
  }
  const element = createBlock(patch.block, version, shifts, wiring);
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
  version: number,
  shifts: readonly LineShiftRecord[],
  wiring: RenderWorkerWiring,
  elements: BlockElements,
  layout: BlockLayout,
): void {
  const start = performance.now();
  removeBlocks(removed, elements, layout);
  for (const patch of blocks) {
    insertPatch(patch, version, shifts, wiring, elements, layout);
  }
  performance.measure("preview-patch", { start, end: performance.now() });
}

function applyBlocks(
  result: RenderResult & { ok: true },
  shifts: LineShiftRecord[],
  wiring: RenderWorkerWiring,
  elements: BlockElements,
  layout: BlockLayout,
): void {
  if (result.mode === "replace") {
    // Replaced blocks are rendered from the current document, so no old shift
    // can apply to them.
    shifts.length = 0;
    replaceBlocks(result.blocks, result.version, shifts, wiring, elements, layout);
  } else if (result.mode === "append") {
    appendBlocks(result.blocks, result.version, shifts, wiring, elements, layout);
  } else {
    for (const shift of result.lineShifts ?? []) {
      shifts.push({ ...shift, version: result.version });
    }
    patchBlocks(
      result.blocks,
      result.removed,
      result.version,
      shifts,
      wiring,
      elements,
      layout,
    );
  }
  wiring.preview.dataset["renderComplete"] = String(result.complete);
}

function applyRenderResult(
  result: RenderResult,
  shifts: LineShiftRecord[],
  wiring: RenderWorkerWiring,
  elements: BlockElements,
  layout: BlockLayout,
): boolean {
  return wiring.scheduler.applyResult(result.id, result, (appliedResponse) => {
    if (appliedResponse.ok) {
      applyBlocks(appliedResponse, shifts, wiring, elements, layout);
      wiring.showStatus();
    } else {
      wiring.showStatus(appliedResponse.message);
    }
  });
}

function anchorElement(
  root: HTMLElement,
  blockId: string,
): HTMLElement | null {
  const escaped = blockId.replaceAll('"', '\\"');
  return root.querySelector<HTMLElement>(`[data-block-id="${escaped}"]`);
}

// The line a block currently starts on. The worker's last sent line is the
// baseline; line-count changes after that block was rendered are applied from
// the preview's ledger without rewriting every block's attributes.
export function blockLine(element: HTMLElement): number {
  let line = Number(element.dataset["line"] ?? "0");
  const version = Number(element.dataset["version"] ?? "0");
  const table = shiftTables.get(element);
  for (const shift of table?.shifts ?? []) {
    if (shift.version <= version) {
      continue;
    }
    if (shift.after === null) {
      line += shift.delta;
      continue;
    }
    const anchor = table ? anchorElement(table.root, shift.after) : null;
    if (anchor && anchor !== element &&
      (anchor.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) {
      line += shift.delta;
    }
  }
  return line;
}

function topPreviewBlock(preview: HTMLElement): HTMLElement | null {
  const bounds = preview.getBoundingClientRect();
  for (const offset of [1, 25]) {
    const target = document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + offset,
    );
    const block = target instanceof Element
      ? target.closest<HTMLElement>(".preview-block")
      : null;
    if (block) {
      return block;
    }
  }
  return null;
}

export function previewTopLine(preview: HTMLElement): number {
  const block = topPreviewBlock(preview);
  return block === null ? 1 : blockLine(block);
}

export function scrollPreviewToLine(preview: HTMLElement, line: number): void {
  let selected: HTMLElement | null = null;
  for (const block of preview.querySelectorAll<HTMLElement>(".preview-block")) {
    if (blockLine(block) > line) {
      break;
    }
    selected = block;
  }
  selected ??= preview.querySelector<HTMLElement>(".preview-block");
  if (selected) {
    const top = selected.getBoundingClientRect().top - preview.getBoundingClientRect().top;
    preview.scrollTop += top;
  }
}

export function wireRenderWorker(
  renderWorker: RenderWorkerEvents,
  wiring: RenderWorkerWiring,
): void {
  const elements: BlockElements = new Map();
  const shifts: LineShiftRecord[] = [];
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
    const applied = applyRenderResult(response, shifts, wiring, elements, layout);
    if (applied && response.ok) {
      shown = {
        docId: response.docId,
        epoch: response.epoch,
        version: response.version,
      };
      if (response.mode === "append") {
        renderWorker.postMessage({
          op: "fill-ready",
          docId: response.docId,
          epoch: response.epoch,
          version: response.version,
          token: response.fillToken,
        } satisfies RenderFillReadyMessage);
      }
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
