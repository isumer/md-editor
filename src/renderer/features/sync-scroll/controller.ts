import {
  previewTopForLine,
  sourceLineForPreviewTop,
  type PageGeometry,
  type SyncAnchor,
} from "./mapping";

const ENABLED_STORAGE_KEY = "syncScroll.enabled";

export interface SyncScrollControllerOptions {
  readonly blockLine: (element: HTMLElement) => number;
  readonly editorScroll: HTMLElement;
  readonly isActive?: () => boolean;
  readonly preview: HTMLElement;
  readonly requestFrame?: (callback: FrameRequestCallback) => number;
  readonly sourceLineAtEditorTop: () => number;
  readonly scrollEditorToLine: (line: number) => void;
}

export class SyncScrollController {
  private anchors: readonly SyncAnchor[] = [];
  private enabled = localStorage.getItem(ENABLED_STORAGE_KEY) !== "false";
  private editorFrame = false;
  private previewFrame = false;
  private refreshFrame = false;
  private editorTargetLine: number | null = null;
  private previewWriteTop: number | null = null;
  private anchorTimer: ReturnType<typeof setTimeout> | null = null;
  private documentRoot: Element | null;
  private pages: HTMLElement[] = [];
  private readonly pageSet = new Set<HTMLElement>();
  private readonly pendingPages = new Set<HTMLElement>();
  private pageGeometry: PageGeometry[] = [];
  private previewMaxTop = 0;
  private previewTargetTop: number | null = null;
  private lastPreviewLine: number | null = null;
  private previewCanDriveEditor = true;
  private readonly requestFrame: (callback: FrameRequestCallback) => number;
  private readonly isActive: () => boolean;
  private readonly mutationObserver: MutationObserver;
  private readonly resizeObserver: ResizeObserver | null;

  constructor(private readonly options: SyncScrollControllerOptions) {
    this.requestFrame = options.requestFrame ?? ((callback) => requestAnimationFrame(callback));
    this.isActive = options.isActive ?? (() => true);
    this.documentRoot = options.preview.firstElementChild;
    options.editorScroll.addEventListener("scroll", this.onEditorScroll, { passive: true });
    options.editorScroll.addEventListener("keydown", this.onEditorInput);
    options.editorScroll.addEventListener("pointerdown", this.onEditorInput, { passive: true });
    options.preview.addEventListener("scroll", this.onPreviewScroll, { passive: true });
    options.preview.addEventListener("pointerdown", this.onPreviewInput, { passive: true });
    options.preview.addEventListener("wheel", this.onPreviewInput, { passive: true });
    options.preview.addEventListener(
      "contentvisibilityautostatechange",
      this.onContentVisibilityChange,
      true,
    );
    this.collectPages(options.preview);
    this.mutationObserver = new MutationObserver((records) => this.onPreviewMutation(records));
    this.mutationObserver.observe(options.preview, { childList: true, subtree: true });
    this.resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => this.scheduleDelayedRefresh());
    this.resizeObserver?.observe(options.preview);
    this.scheduleAnchorRefresh();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.editorTargetLine = null;
    this.previewWriteTop = null;
    localStorage.setItem(ENABLED_STORAGE_KEY, String(enabled));
  }

  toggle(): void {
    this.setEnabled(!this.enabled);
  }

  refreshAnchors(): void {
    const preview = this.options.preview;
    const previewTop = preview.getBoundingClientRect().top;
    const scrollTop = preview.scrollTop;
    this.previewMaxTop = Math.max(0, preview.scrollHeight - preview.clientHeight);
    if (this.pages.length > 0) {
      this.anchors = [];
      this.refreshPageGeometry(previewTop, scrollTop);
      return;
    }
    this.anchors = this.blockAnchors(preview, previewTop, scrollTop).sort((left, right) =>
      left.blockTop - right.blockTop || left.sourceLine - right.sourceLine);
  }

  dispose(): void {
    this.options.editorScroll.removeEventListener("scroll", this.onEditorScroll);
    this.options.editorScroll.removeEventListener("keydown", this.onEditorInput);
    this.options.editorScroll.removeEventListener("pointerdown", this.onEditorInput);
    this.options.preview.removeEventListener("scroll", this.onPreviewScroll);
    this.options.preview.removeEventListener("pointerdown", this.onPreviewInput);
    this.options.preview.removeEventListener("wheel", this.onPreviewInput);
    this.options.preview.removeEventListener(
      "contentvisibilityautostatechange",
      this.onContentVisibilityChange,
      true,
    );
    this.mutationObserver.disconnect();
    this.resizeObserver?.disconnect();
    if (this.anchorTimer !== null) clearTimeout(this.anchorTimer);
  }

  private readonly onEditorScroll = (): void => {
    if (!this.enabled || !this.isActive() || this.editorFrame) return;
    this.editorFrame = true;
    this.requestFrame(() => {
      this.editorFrame = false;
      if (!this.isActive()) return;
      const line = this.options.sourceLineAtEditorTop();
      if (this.editorTargetLine !== null && Math.abs(line - this.editorTargetLine) <= 1) return;
      this.editorTargetLine = null;
      this.previewTargetTop = null;
      this.lastPreviewLine = null;
      this.options.preview.scrollTop = previewTopForLine(
        this.anchorsForLine(line),
        line,
        this.previewMaxTop,
      );
      this.previewWriteTop = this.options.preview.scrollTop;
    });
  };

  private readonly onEditorInput = (): void => {
    this.previewCanDriveEditor = false;
  };

  private readonly onPreviewInput = (): void => {
    this.previewCanDriveEditor = true;
  };

  private readonly onPreviewScroll = (): void => {
    if (this.anchorTimer !== null) this.scheduleDelayedRefresh(true, 250);
    const top = this.options.preview.scrollTop;
    if (this.previewWriteTop !== null && Math.abs(top - this.previewWriteTop) <= 1) return;
    this.previewWriteTop = null;
    if (!this.enabled || !this.isActive() || !this.previewCanDriveEditor ||
      this.previewFrame || !this.hasAnchors()) {
      return;
    }
    this.previewTargetTop = top;
    this.previewFrame = true;
    this.requestFrame(() => {
      this.previewFrame = false;
      this.applyPreviewTarget(false);
    });
  };

  private readonly onContentVisibilityChange = (event: Event): void => {
    this.markPagesWithin(event.target);
    if (event.target === this.options.preview) {
      this.scheduleAnchorRefresh();
    } else {
      this.scheduleDelayedRefresh(true, 250);
    }
  };

  private applyPreviewTarget(skipUnchanged: boolean): void {
    if (!this.enabled || this.previewTargetTop === null || !this.hasAnchors()) return;
    if (!this.isActive() || !this.previewCanDriveEditor) {
      this.previewTargetTop = null;
      return;
    }
    const anchors = this.anchorsForTop(this.previewTargetTop);
    if (anchors.length === 0) return;
    const line = sourceLineForPreviewTop(anchors, this.previewTargetTop);
    if (skipUnchanged && line === this.lastPreviewLine) return;
    this.lastPreviewLine = line;
    this.editorTargetLine = line;
    this.options.scrollEditorToLine(line);
  }

  private refreshAndReapply(): void {
    if (!this.isActive()) return;
    this.refreshAnchors();
    this.applyPreviewTarget(true);
  }

  private hasAnchors(): boolean {
    return this.pageGeometry.some((geometry) => geometry.anchors.length > 0) ||
      this.anchors.length > 0;
  }

  private anchorsForLine(line: number): readonly SyncAnchor[] {
    if (this.pageGeometry.length === 0) return this.anchors;
    let low = 0;
    let high = this.pageGeometry.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const geometry = this.pageGeometry[middle] as PageGeometry;
      if (geometry.sourceLine <= line) low = middle + 1;
      else high = middle - 1;
    }
    return this.nearbyPageAnchors(Math.max(0, high));
  }

  private anchorsForTop(top: number): readonly SyncAnchor[] {
    if (this.pageGeometry.length === 0) return this.anchors;
    let low = 0;
    let high = this.pageGeometry.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const geometry = this.pageGeometry[middle] as PageGeometry;
      if (geometry.top <= top) low = middle + 1;
      else high = middle - 1;
    }
    return this.nearbyPageAnchors(Math.max(0, high));
  }

  private nearbyPageAnchors(index: number): readonly SyncAnchor[] {
    const anchors: SyncAnchor[] = [];
    for (let offset = 0; offset < 2; offset += 1) {
      const geometry = this.pageGeometry[index + offset];
      if (geometry !== undefined) anchors.push(...geometry.anchors);
    }
    return anchors;
  }

  private measurePage(
    page: HTMLElement,
    previewTop: number,
    scrollTop: number,
  ): PageGeometry {
    const bounds = page.getBoundingClientRect();
    const blockAnchors = this.blockAnchors(page, previewTop, scrollTop);
    const blocks = page.querySelectorAll<HTMLElement>(".preview-block");
    const first = blocks.item(0);
    const last = blocks.item(blocks.length - 1);
    const sourceLine = first === null
      ? Number.MAX_SAFE_INTEGER
      : this.options.blockLine(first) + 1;
    const top = bounds.top - previewTop + scrollTop;
    const fallback = bounds.height > 0 && first !== null
      ? [{ sourceLine, blockTop: top, blockHeight: bounds.height }]
      : [];
    const anchors = blockAnchors.length > 0 ? blockAnchors : fallback;
    return {
      anchors: blockAnchors.length > 0
        ? anchors
        : this.withTerminalAnchor(page, blocks, last, anchors, bounds.bottom - previewTop + scrollTop),
      height: bounds.height,
      page,
      sourceLine,
      top,
    };
  }

  private withTerminalAnchor(
    page: HTMLElement,
    blocks: NodeListOf<HTMLElement>,
    last: HTMLElement | null,
    anchors: readonly SyncAnchor[],
    bottom: number,
  ): readonly SyncAnchor[] {
    if (this.pages.at(-1) !== page || last === null) return anchors;
    const previous = blocks.item(blocks.length - 2);
    const lastLine = this.options.blockLine(last) + 1;
    const lineStep = previous === null
      ? 1
      : Math.max(1, lastLine - (this.options.blockLine(previous) + 1));
    const terminal = { sourceLine: lastLine + lineStep, blockTop: bottom, blockHeight: 0 };
    return anchors.at(-1)?.blockTop !== undefined && bottom > (anchors.at(-1)?.blockTop ?? bottom)
      ? [...anchors, terminal]
      : anchors;
  }

  private blockAnchors(
    container: ParentNode,
    previewTop: number,
    scrollTop: number,
  ): SyncAnchor[] {
    return [...container.querySelectorAll<HTMLElement>(".preview-block")]
      .flatMap((block) => {
        const bounds = block.getBoundingClientRect();
        return bounds.height <= 0 ? [] : [{
          sourceLine: this.options.blockLine(block) + 1,
          blockTop: bounds.top - previewTop + scrollTop,
          blockHeight: bounds.height,
        }];
      });
  }

  private refreshPageGeometry(
    previewTop: number,
    scrollTop: number,
  ): void {
    const previous = new Map(this.pageGeometry.map((geometry) => [geometry.page, geometry]));
    const next: PageGeometry[] = [];
    let shift = 0;
    for (const page of this.pages) {
      const cached = previous.get(page);
      if (this.pendingPages.has(page) || cached === undefined) {
        const measured = this.measurePage(page, previewTop, scrollTop);
        shift += cached === undefined ? 0 : measured.height - cached.height;
        next.push(measured);
      } else {
        next.push(shift === 0 ? cached : { ...cached, top: cached.top + shift,
          anchors: cached.anchors.map((anchor) => ({ ...anchor, blockTop: anchor.blockTop + shift })) });
      }
    }
    this.pendingPages.clear();
    this.pageGeometry = next;
  }

  private onPreviewMutation(records: readonly MutationRecord[]): void {
    const nextRoot = this.options.preview.firstElementChild;
    if (nextRoot !== this.documentRoot) {
      this.documentRoot = nextRoot;
      this.anchors = [];
      this.pages = [];
      this.pageGeometry = [];
      this.pageSet.clear();
      this.pendingPages.clear();
      this.previewTargetTop = null;
      this.lastPreviewLine = null;
      this.editorTargetLine = null;
      this.previewWriteTop = null;
    }
    if (records.some((record) => record.removedNodes.length > 0)) {
      this.pages = this.pages.filter((page) => {
        const keep = page.isConnected && this.documentRoot?.contains(page) === true;
        if (!keep) this.pageSet.delete(page);
        return keep;
      });
    }
    for (const record of records) {
      this.markMutationPage(record.target);
      for (const node of record.addedNodes) this.collectPages(node);
    }
    this.scheduleAnchorRefresh();
  }

  private collectPages(root: Node): void {
    if (root instanceof HTMLElement && root.classList.contains("preview-page")) {
      this.insertPage(root);
      return;
    }
    if (!(root instanceof Element)) return;
    const canContainPages = root === this.options.preview ||
      root instanceof HTMLElement &&
      (root.classList.contains("preview-section") ||
        root.classList.contains("preview-document"));
    if (!canContainPages) return;
    for (const page of root.querySelectorAll<HTMLElement>(".preview-page")) {
      this.insertPage(page);
    }
  }

  private insertPage(page: HTMLElement): void {
    if (this.pageSet.has(page)) return;
    this.pendingPages.add(page);
    const last = this.pages.at(-1);
    if (last === undefined ||
      (last.compareDocumentPosition(page) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) {
      this.pages.push(page);
      this.pageSet.add(page);
      return;
    }
    let low = 0;
    let high = this.pages.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const current = this.pages[middle] as HTMLElement;
      if ((current.compareDocumentPosition(page) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    this.pages.splice(low, 0, page);
    this.pageSet.add(page);
  }

  private scheduleAnchorRefresh(): void {
    if (this.refreshFrame) return;
    this.refreshFrame = true;
    this.requestFrame(() => {
      this.refreshFrame = false;
      this.refreshAndReapply();
    });
  }

  private markPagesWithin(target: EventTarget | Node | null): void {
    if (!(target instanceof Element)) return;
    if (target instanceof HTMLElement && target.classList.contains("preview-page")) {
      this.pendingPages.add(target);
      return;
    }
    for (const page of target.querySelectorAll<HTMLElement>(".preview-page")) {
      this.pendingPages.add(page);
    }
  }

  private markMutationPage(target: Node): void {
    if (!(target instanceof Element)) return;
    const page = target instanceof HTMLElement && target.classList.contains("preview-page")
      ? target
      : target.closest<HTMLElement>(".preview-page");
    if (page !== null) this.pendingPages.add(page);
  }

  private scheduleDelayedRefresh(restart = false, delay = 100): void {
    if (this.anchorTimer !== null) {
      if (!restart) return;
      clearTimeout(this.anchorTimer);
    }
    this.anchorTimer = setTimeout(() => {
      this.anchorTimer = null;
      this.scheduleAnchorRefresh();
    }, delay);
  }
}
