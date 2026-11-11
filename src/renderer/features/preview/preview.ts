import type {
  RenderBlock,
  RenderBlockPatch,
  RenderFillReadyMessage,
  RenderResponse,
  RenderResync,
  RenderResult,
} from "../../../shared/workers/render";
import { formatMessage } from "../../core/messages";
import type { ReplicatedVersion } from "../../core/replication";
import { openExternal } from "../../platform/api";
import { RenderScheduler } from "./renderScheduler";
import {
  type BlockElements,
  type BlockLayout,
  type LineShiftRecord,
  PreviewDocuments,
  recordShiftTable,
  resetLayout,
} from "./previewDocuments";
import { sanitizeRenderedHtml } from "./sanitize";

export { PreviewDocuments } from "./previewDocuments";
export { blockLine } from "./previewDocuments";

export interface RenderWorkerEvents {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<RenderResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

interface RenderWorkerWiring {
  scheduler: RenderScheduler;
  preview: HTMLElement;
  showStatus(message?: string): void;
  showError(message?: string): void;
  currentVersion(): ReplicatedVersion;
  onResync(response: RenderResync): void;
  rewriteHtml(html: string): string;
}

const BLOCK_CLASS = "preview-block";
// TEMP(AC-PERF-10 diagnosis): per-apply phase timings published as a
// "preview-apply" performance measure; removed once the CI numbers are in.
const applyPhases = {
  sanitizeMs: 0, rewriteMs: 0, htmlMs: 0, blocks: 0, htmlBytes: 0,
  perBlockMs: [] as number[], parserFirstMs: -1,
};
let sanitizeCalls = 0;
const heapMb = (): number => {
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return memory === undefined ? -1 : Math.round(memory.usedJSHeapSize / 1048576);
};
// Blocks are packed into pages and pages into sections so content-visibility
// skips whole regions without one containment decision per block: the cost of
// re-checking containing elements grows with their count, so a flat list of
// one wrapper per block makes scrolling slower as the document gets larger.
// Each content-visibility element is an intersection target on every scrolled
// frame, so 20 x 20 grouping cuts that work fourfold against 10 x 10: a 20 MB
// fling under software compositing spends about 4.5 ms per frame on the main
// thread instead of 15 ms.
const PAGE_BLOCK_LIMIT = 20;
const SECTION_PAGE_LIMIT = 20;
const APPEND_TASK_BLOCK_LIMIT = 4;
// Worker fills have at most eight blocks; only the larger initial batch is
// frame-paced.
const APPEND_FRAME_BLOCK_THRESHOLD = 8;
// A section also bounds the layout work when it becomes visible: its pages
// stay skipped until they near the viewport, so a 400-block section lays out
// 20 page boxes, not 400 blocks.
// Patches insert into and remove from existing pages, so later pages can be
// uneven: content-visibility needs a bounded page size, not an even one.

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
  recordShiftTable(element, wiring.preview, shifts);
  if (sanitizeCalls === 0) {
    // Splits the first-call cost: HTML parser first use against the sanitizer.
    const parserStart = performance.now();
    new DOMParser().parseFromString("<p>x</p>", "text/html");
    applyPhases.parserFirstMs = Math.round((performance.now() - parserStart) * 10) / 10;
  }
  const sanitizeStart = performance.now();
  const clean = sanitizeRenderedHtml(block.html);
  sanitizeCalls += 1;
  const rewriteStart = performance.now();
  const html = wiring.rewriteHtml(clean);
  const htmlStart = performance.now();
  element.innerHTML = html;
  const htmlEnd = performance.now();
  applyPhases.sanitizeMs += rewriteStart - sanitizeStart;
  applyPhases.perBlockMs.push(Math.round((rewriteStart - sanitizeStart) * 10) / 10);
  applyPhases.rewriteMs += htmlStart - rewriteStart;
  applyPhases.htmlMs += htmlEnd - htmlStart;
  applyPhases.blocks += 1;
  applyPhases.htmlBytes += block.html.length;
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
      wiring.showError();
      wiring.showStatus();
    } else {
      wiring.showError(appliedResponse.message);
      wiring.showStatus(appliedResponse.message);
    }
  });
}

function requestNextFill(
  renderWorker: RenderWorkerEvents,
  response: RenderResult & { ok: true; mode: "append" },
): void {
  requestAnimationFrame(() => {
    renderWorker.postMessage({
      op: "fill-ready",
      docId: response.docId,
      epoch: response.epoch,
      version: response.version,
      token: response.fillToken,
    } satisfies RenderFillReadyMessage);
  });
}

export function wireRenderWorker(
  renderWorker: RenderWorkerEvents,
  wiring: RenderWorkerWiring,
): PreviewDocuments {
  const previews = new PreviewDocuments(wiring.preview);
  // Patch results are ordered deltas, so a result is stale only once a newer
  // version has actually been shown; comparing against the live editor version
  // would discard a delta the preview still needs.
  let shown: { docId: string; epoch: number; version: number } | null = null;
  let pendingAppend: {
    response: RenderResult & { ok: true; mode: "append" };
    frame: number;
    timer: number;
  } | null = null;
  const queuedResponses: RenderResponse[] = [];
  let queuedResponseTimer = 0;

  function scheduleQueuedResponse(): void {
    if (queuedResponses.length === 0 || queuedResponseTimer !== 0) {
      return;
    }
    queuedResponseTimer = window.setTimeout(() => {
      queuedResponseTimer = 0;
      const response = queuedResponses.shift();
      if (response !== undefined) {
        handleResponse(response);
      }
      if (pendingAppend === null) {
        scheduleQueuedResponse();
      }
    }, 0);
  }

  const deferAppend = (
    pending: NonNullable<typeof pendingAppend>,
    waitForFrame: boolean,
  ): void => {
    if (waitForFrame) {
      pending.frame = requestAnimationFrame(() => {
        pending.timer = window.setTimeout(flushAppend, 0);
      });
    } else {
      pending.timer = window.setTimeout(flushAppend, 0);
    }
  };

  const applyAccepted = (
    response: RenderResult,
    requestFill: boolean,
  ): boolean => {
    performance.clearMarks("preview-apply-start");
    performance.clearMarks("preview-apply-end");
    const applyStart = performance.mark("preview-apply-start").startTime;
    const firstSanitize = sanitizeCalls === 0;
    Object.assign(applyPhases, {
      sanitizeMs: 0, rewriteMs: 0, htmlMs: 0, blocks: 0, htmlBytes: 0, perBlockMs: [], parserFirstMs: -1,
    });
    const heapBefore = heapMb();
    const documentPreview = previews.getOrCreate(response.docId, response.epoch);
    const documentWiring = { ...wiring, preview: documentPreview.container };
    const applied = applyRenderResult(
      response,
      documentPreview.shifts,
      documentWiring,
      documentPreview.elements,
      documentPreview.layout,
    );
    performance.mark("preview-apply-end");
    performance.measure("preview-apply", {
      start: applyStart,
      end: performance.now(),
      detail: {
        ...applyPhases, firstSanitize, heapBefore, heapAfter: heapMb(),
        mode: response.ok ? response.mode : "error",
      },
    });
    if (applied && response.ok) {
      documentPreview.version = response.version;
      previews.display(documentPreview);
      shown = {
        docId: response.docId,
        epoch: response.epoch,
        version: response.version,
      };
      if (requestFill && response.mode === "append") {
        requestNextFill(renderWorker, response);
      }
    }
    return applied;
  };

  const flushAppend = (): void => {
    const pending = pendingAppend;
    if (pending === null) {
      return;
    }
    cancelAnimationFrame(pending.frame);
    window.clearTimeout(pending.timer);
    pendingAppend = null;
    const current = wiring.currentVersion();
    if (pending.response.docId !== current.docId ||
      pending.response.epoch !== current.epoch) {
      scheduleQueuedResponse();
      return;
    }
    if (pending.response.blocks.length <= APPEND_TASK_BLOCK_LIMIT) {
      applyAccepted(pending.response, true);
      scheduleQueuedResponse();
      return;
    }
    const next = {
      ...pending.response,
      blocks: pending.response.blocks.slice(0, APPEND_TASK_BLOCK_LIMIT),
      complete: false,
    };
    if (!applyAccepted(next, false)) {
      scheduleQueuedResponse();
      return;
    }
    const remainder = {
      ...pending.response,
      blocks: pending.response.blocks.slice(APPEND_TASK_BLOCK_LIMIT),
    };
    const nextPending = { response: remainder, frame: 0, timer: 0 };
    pendingAppend = nextPending;
    deferAppend(nextPending, true);
  };

  function handleResponse(response: RenderResponse): void {
    const current = wiring.currentVersion();
    if ("op" in response) {
      if (response.op === "resync" &&
        response.docId === current.docId && response.epoch === current.epoch) {
        wiring.onResync(response);
      }
      return;
    }
    if (response.docId !== current.docId || response.epoch !== current.epoch) {
      return;
    }
    if (response.version > current.version) {
      return;
    }
    if (shown !== null && shown.docId === response.docId &&
      shown.epoch === response.epoch && response.version < shown.version) {
      return;
    }
    if (response.ok && response.mode === "append" &&
      response.blocks.length > APPEND_TASK_BLOCK_LIMIT) {
      const first = {
        ...response,
        blocks: response.blocks.slice(0, APPEND_TASK_BLOCK_LIMIT),
        complete: false,
      };
      if (!applyAccepted(first, false)) {
        return;
      }
      const remainder = {
        ...response,
        blocks: response.blocks.slice(APPEND_TASK_BLOCK_LIMIT),
      };
      const pending = {
        response: remainder,
        frame: 0,
        timer: 0,
      };
      pendingAppend = pending;
      deferAppend(pending, response.blocks.length > APPEND_FRAME_BLOCK_THRESHOLD);
      return;
    }
    applyAccepted(response, true);
  }

  renderWorker.onmessage = (event: MessageEvent<RenderResponse>) => {
    if (pendingAppend !== null) {
      flushAppend();
      if (pendingAppend !== null || queuedResponses.length > 0) {
        queuedResponses.push(event.data);
        return;
      }
    }
    handleResponse(event.data);
  };

  renderWorker.onerror = (event) => {
    const message = event.message || "The preview worker failed";
    wiring.showError(message);
    wiring.showStatus(message);
  };

  return previews;
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
