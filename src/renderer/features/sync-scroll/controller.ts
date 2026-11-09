import {
  previewTopForLine,
  sourceLineForPreviewTop,
  type SyncAnchor,
} from "./mapping";

const ENABLED_STORAGE_KEY = "syncScroll.enabled";

export interface SyncScrollControllerOptions {
  readonly blockLine: (element: HTMLElement) => number;
  readonly editorScroll: HTMLElement;
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
  private visibilityFrame = false;
  private suppressEditor = false;
  private suppressPreview = false;
  private anchorTimer: ReturnType<typeof setTimeout> | null = null;
  private documentRoot: Element | null;
  private pages: HTMLElement[] = [];
  private readonly pageSet = new Set<HTMLElement>();
  private previewTargetTop: number | null = null;
  private lastPreviewLine: number | null = null;
  private readonly requestFrame: (callback: FrameRequestCallback) => number;
  private readonly mutationObserver: MutationObserver;
  private readonly resizeObserver: ResizeObserver | null;

  constructor(private readonly options: SyncScrollControllerOptions) {
    this.requestFrame = options.requestFrame ?? ((callback) => requestAnimationFrame(callback));
    this.documentRoot = options.preview.firstElementChild;
    options.editorScroll.addEventListener("scroll", this.onEditorScroll, { passive: true });
    options.preview.addEventListener("scroll", this.onPreviewScroll, { passive: true });
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
    this.requestFrame(() => this.refreshAnchors());
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    localStorage.setItem(ENABLED_STORAGE_KEY, String(enabled));
  }

  toggle(): void {
    this.setEnabled(!this.enabled);
  }

  refreshAnchors(): void {
    if (this.pages.length > 0) {
      this.anchors = [];
      return;
    }
    const previewTop = this.options.preview.getBoundingClientRect().top;
    const scrollTop = this.options.preview.scrollTop;
    this.anchors = this.blockAnchors(this.options.preview, previewTop, scrollTop).sort((left, right) =>
      left.blockTop - right.blockTop || left.sourceLine - right.sourceLine);
  }

  dispose(): void {
    this.options.editorScroll.removeEventListener("scroll", this.onEditorScroll);
    this.options.preview.removeEventListener("scroll", this.onPreviewScroll);
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
    if (!this.enabled || this.suppressEditor || this.editorFrame) return;
    this.previewTargetTop = null;
    this.lastPreviewLine = null;
    this.editorFrame = true;
    this.requestFrame(() => {
      this.editorFrame = false;
      const maxTop = this.options.preview.scrollHeight - this.options.preview.clientHeight;
      const line = this.options.sourceLineAtEditorTop();
      this.suppressPreview = true;
      this.options.preview.scrollTop = previewTopForLine(
        this.anchorsForLine(line),
        line,
        Math.max(0, maxTop),
      );
      this.requestFrame(() => { this.suppressPreview = false; });
    });
  };

  private readonly onPreviewScroll = (): void => {
    if (!this.enabled || this.suppressPreview || this.previewFrame || !this.hasAnchors()) {
      return;
    }
    this.previewTargetTop = this.options.preview.scrollTop;
    this.previewFrame = true;
    this.requestFrame(() => {
      this.previewFrame = false;
      this.applyPreviewTarget(false);
    });
  };

  private readonly onContentVisibilityChange = (): void => {
    if (this.visibilityFrame) return;
    this.visibilityFrame = true;
    this.requestFrame(() => {
      this.visibilityFrame = false;
      this.refreshAndReapply();
    });
  };

  private applyPreviewTarget(skipUnchanged: boolean): void {
    if (!this.enabled || this.previewTargetTop === null || !this.hasAnchors()) return;
    const anchors = this.anchorsForTop(this.previewTargetTop);
    if (anchors.length === 0) return;
    const line = sourceLineForPreviewTop(anchors, this.previewTargetTop);
    if (skipUnchanged && line === this.lastPreviewLine) return;
    this.lastPreviewLine = line;
    this.suppressEditor = true;
    this.options.scrollEditorToLine(line);
    this.requestFrame(() => { this.suppressEditor = false; });
  }

  private refreshAndReapply(): void {
    this.refreshAnchors();
    this.applyPreviewTarget(true);
  }

  private hasAnchors(): boolean {
    return this.pages.length > 0 || this.anchors.length > 0;
  }

  private anchorsForLine(line: number): readonly SyncAnchor[] {
    if (this.pages.length === 0) return this.anchors;
    let low = 0;
    let high = this.pages.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const page = this.pages[middle];
      if (page === undefined) break;
      if (this.pageLine(page) <= line) low = middle + 1;
      else high = middle - 1;
    }
    return this.nearbyPageAnchors(Math.max(0, high));
  }

  private anchorsForTop(top: number): readonly SyncAnchor[] {
    if (this.pages.length === 0) return this.anchors;
    const previewTop = this.options.preview.getBoundingClientRect().top;
    const scrollTop = this.options.preview.scrollTop;
    let low = 0;
    let high = this.pages.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const page = this.pages[middle];
      if (page === undefined) break;
      const anchor = this.pageAnchor(page, previewTop, scrollTop)[0];
      if (anchor !== undefined && anchor.blockTop <= top) low = middle + 1;
      else high = middle - 1;
    }
    return this.nearbyPageAnchors(Math.max(0, high), previewTop, scrollTop);
  }

  private nearbyPageAnchors(
    index: number,
    previewTop = this.options.preview.getBoundingClientRect().top,
    scrollTop = this.options.preview.scrollTop,
  ): readonly SyncAnchor[] {
    const anchors: SyncAnchor[] = [];
    for (let offset = 0; offset < 2; offset += 1) {
      const page = this.pages[index + offset];
      if (page !== undefined) anchors.push(...this.pageAnchor(page, previewTop, scrollTop));
    }
    return anchors;
  }

  private pageLine(page: HTMLElement): number {
    const firstBlock = page.querySelector<HTMLElement>(".preview-block");
    return firstBlock === null ? Number.MAX_SAFE_INTEGER : this.options.blockLine(firstBlock) + 1;
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

  private pageAnchor(
    page: HTMLElement,
    previewTop: number,
    scrollTop: number,
  ): SyncAnchor[] {
    const firstBlock = page.querySelector<HTMLElement>(".preview-block");
    if (firstBlock === null) return [];
    const bounds = page.getBoundingClientRect();
    const pageAnchor = {
      sourceLine: this.options.blockLine(firstBlock) + 1,
      blockTop: bounds.top - previewTop + scrollTop,
      blockHeight: bounds.height,
    };
    return bounds.height <= 0 ? [] : [pageAnchor];
  }

  private onPreviewMutation(records: readonly MutationRecord[]): void {
    const nextRoot = this.options.preview.firstElementChild;
    if (nextRoot !== this.documentRoot) {
      this.documentRoot = nextRoot;
      this.anchors = [];
      this.pages = [];
      this.pageSet.clear();
      this.previewTargetTop = null;
      this.lastPreviewLine = null;
    }
    if (records.some((record) => record.removedNodes.length > 0)) {
      this.pages = this.pages.filter((page) => {
        const keep = page.isConnected && this.documentRoot?.contains(page) === true;
        if (!keep) this.pageSet.delete(page);
        return keep;
      });
    }
    for (const record of records) {
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
      const current = this.pages[middle];
      if (current !== undefined &&
        (current.compareDocumentPosition(page) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    this.pages.splice(low, 0, page);
    this.pageSet.add(page);
  }

  private scheduleAnchorRefresh(): void {
    if (this.options.preview.dataset["renderComplete"] === "true") {
      this.requestFrame(() => this.refreshAndReapply());
    } else {
      this.scheduleDelayedRefresh();
    }
  }

  private scheduleDelayedRefresh(): void {
    if (this.anchorTimer !== null) return;
    this.anchorTimer = setTimeout(() => {
      this.anchorTimer = null;
      this.requestFrame(() => this.refreshAndReapply());
    }, 100);
  }
}
