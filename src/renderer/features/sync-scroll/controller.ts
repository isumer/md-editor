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
    this.anchors = [...this.options.preview.querySelectorAll<HTMLElement>(".preview-block")]
      .map((block) => {
        const bounds = block.getBoundingClientRect();
        return {
          sourceLine: this.options.blockLine(block) + 1,
          blockTop: bounds.top - previewTop + scrollTop,
          blockHeight: bounds.height,
        };
      });
  }

  dispose(): void {
    this.options.editorScroll.removeEventListener("scroll", this.onEditorScroll);
    this.options.preview.removeEventListener("scroll", this.onPreviewScroll);
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
