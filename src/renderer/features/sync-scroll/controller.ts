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
    this.mutationObserver = new MutationObserver(() => this.onPreviewMutation());
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
      : pages.flatMap((page) => this.pageAnchor(page, previewTop, scrollTop));
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
    this.previewTargetTop = null;
    this.lastPreviewLine = null;
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
    if (!this.enabled || this.suppressPreview || this.previewFrame || this.anchors.length === 0) {
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
    if (!this.enabled || this.previewTargetTop === null || this.anchors.length === 0) return;
    const line = sourceLineForPreviewTop(this.anchors, this.previewTargetTop);
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

  private onPreviewMutation(): void {
    const nextRoot = this.options.preview.firstElementChild;
    if (nextRoot !== this.documentRoot) {
      this.documentRoot = nextRoot;
      this.anchors = [];
      this.previewTargetTop = null;
      this.lastPreviewLine = null;
    }
    this.scheduleAnchorRefresh();
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
