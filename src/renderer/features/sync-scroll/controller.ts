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
  private readonly requestFrame: (callback: FrameRequestCallback) => number;
  private readonly mutationObserver: MutationObserver;
  private readonly resizeObserver: ResizeObserver | null;

  constructor(private readonly options: SyncScrollControllerOptions) {
    this.requestFrame = options.requestFrame ?? ((callback) => requestAnimationFrame(callback));
    options.editorScroll.addEventListener("scroll", this.onEditorScroll, { passive: true });
    options.preview.addEventListener("scroll", this.onPreviewScroll, { passive: true });
    options.preview.addEventListener(
      "contentvisibilityautostatechange",
      this.onContentVisibilityChange,
      true,
    );
    this.mutationObserver = new MutationObserver(() => this.scheduleAnchorRefresh());
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
    const previewTop = this.options.preview.getBoundingClientRect().top;
    const scrollTop = this.options.preview.scrollTop;
    const pages = [...this.options.preview.querySelectorAll<HTMLElement>(".preview-page")];
    const anchors = pages.length === 0
      ? this.blockAnchors(this.options.preview, previewTop, scrollTop)
      : pages.flatMap((page) => this.pageAnchors(page, previewTop, scrollTop));
    this.anchors = anchors.sort((left, right) =>
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
    this.editorFrame = true;
    this.requestFrame(() => {
      this.editorFrame = false;
      const maxTop = this.options.preview.scrollHeight - this.options.preview.clientHeight;
      this.suppressPreview = true;
      this.options.preview.scrollTop = previewTopForLine(
        this.anchors,
        this.options.sourceLineAtEditorTop(),
        Math.max(0, maxTop),
      );
      this.requestFrame(() => { this.suppressPreview = false; });
    });
  };

  private readonly onPreviewScroll = (): void => {
    if (!this.enabled || this.suppressPreview || this.previewFrame) return;
    this.previewFrame = true;
    this.requestFrame(() => {
      this.previewFrame = false;
      this.suppressEditor = true;
      this.options.scrollEditorToLine(sourceLineForPreviewTop(
        this.anchors,
        this.options.preview.scrollTop,
      ));
      this.requestFrame(() => { this.suppressEditor = false; });
    });
  };

  private readonly onContentVisibilityChange = (): void => {
    if (this.visibilityFrame) return;
    this.visibilityFrame = true;
    this.requestFrame(() => {
      this.visibilityFrame = false;
      this.refreshAnchors();
      this.reapplyPreviewTarget();
    });
  };

  private reapplyPreviewTarget(): void {
    if (!this.enabled) return;
    this.suppressEditor = true;
    this.options.scrollEditorToLine(sourceLineForPreviewTop(
      this.anchors,
      this.options.preview.scrollTop,
    ));
    this.requestFrame(() => { this.suppressEditor = false; });
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

  private pageAnchors(
    page: HTMLElement,
    previewTop: number,
    scrollTop: number,
  ): SyncAnchor[] {
    const blockAnchors = this.blockAnchors(page, previewTop, scrollTop);
    const firstBlock = page.querySelector<HTMLElement>(".preview-block");
    if (firstBlock === null) return [];
    const bounds = page.getBoundingClientRect();
    const pageAnchor = {
      sourceLine: this.options.blockLine(firstBlock) + 1,
      blockTop: bounds.top - previewTop + scrollTop,
      blockHeight: bounds.height,
    };
    return blockAnchors.length === 0 ? [pageAnchor] : [pageAnchor, ...blockAnchors];
  }

  private scheduleAnchorRefresh(): void {
    if (this.options.preview.dataset["renderComplete"] === "true") {
      this.requestFrame(() => this.refreshAnchors());
    } else {
      this.scheduleDelayedRefresh();
    }
  }

  private scheduleDelayedRefresh(): void {
    if (this.anchorTimer !== null) clearTimeout(this.anchorTimer);
    this.anchorTimer = setTimeout(() => {
      this.anchorTimer = null;
      this.requestFrame(() => this.refreshAnchors());
    }, 100);
  }
}
