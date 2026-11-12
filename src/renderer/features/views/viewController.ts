export type ViewMode = "split" | "editor" | "preview";

const STORAGE_KEY = "view.dividerShare";
const DEFAULT_SHARE = 0.5;
const MIN_SHARE = 0.2;
const MAX_SHARE = 0.8;
const SIDEBAR_WIDTH = 220;

export interface ViewControllerOptions {
  readonly divider: HTMLElement;
  readonly editorScroll?: HTMLElement;
  readonly preview?: HTMLElement;
  readonly workspace: HTMLElement;
}

function savedShare(): number {
  const value = Number(localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(value) && value >= MIN_SHARE && value <= MAX_SHARE
    ? value
    : DEFAULT_SHARE;
}

function percentage(share: number): string {
  return `${String(Math.round(share * 1_000) / 10)}%`;
}

export class ViewController {
  private share = savedShare();
  private dragging = false;
  private mode: ViewMode = "split";
  private editorScrollTop = 0;
  private previewScrollTop = 0;
  private restoreGeneration = 0;

  constructor(private readonly options: ViewControllerOptions) {
    this.editorScrollTop = options.editorScroll?.scrollTop ?? 0;
    this.previewScrollTop = options.preview?.scrollTop ?? 0;
    this.applyShare();
    this.setMode("split");
    options.divider.addEventListener("pointerdown", this.startDrag);
    options.divider.addEventListener("dblclick", this.resetDivider);
    window.addEventListener("pointermove", this.drag);
    window.addEventListener("pointerup", this.endDrag);
  }

  setMode(mode: ViewMode): void {
    this.captureScroll();
    this.mode = mode;
    this.options.workspace.dataset["viewMode"] = mode;
    this.restoreScroll();
    const generation = ++this.restoreGeneration;
    requestAnimationFrame(() => {
      if (generation === this.restoreGeneration) this.restoreScroll();
    });
  }

  private readonly startDrag = (event: PointerEvent): void => {
    event.preventDefault();
    this.dragging = true;
  };

  private readonly drag = (event: PointerEvent): void => {
    if (this.dragging) this.updateShare(event.clientX);
  };

  private readonly endDrag = (): void => {
    if (!this.dragging) return;
    this.dragging = false;
    localStorage.setItem(STORAGE_KEY, String(this.share));
  };

  private readonly resetDivider = (): void => {
    this.share = DEFAULT_SHARE;
    this.applyShare();
    localStorage.setItem(STORAGE_KEY, String(this.share));
  };

  private updateShare(clientX: number): void {
    const bounds = this.options.workspace.getBoundingClientRect();
    const paneWidth = bounds.width - SIDEBAR_WIDTH;
    if (paneWidth <= 0) return;
    // The share is a fraction of the pane area, so the divider follows the pointer.
    const share = (clientX - bounds.left - SIDEBAR_WIDTH) / paneWidth;
    this.share = Math.min(MAX_SHARE, Math.max(MIN_SHARE, share));
    this.applyShare();
  }

  private captureScroll(): void {
    if (this.mode !== "preview" && this.options.editorScroll) {
      this.editorScrollTop = this.options.editorScroll.scrollTop;
    }
    if (this.mode !== "editor" && this.options.preview) {
      this.previewScrollTop = this.options.preview.scrollTop;
    }
  }

  private restoreScroll(): void {
    if (this.options.editorScroll) this.options.editorScroll.scrollTop = this.editorScrollTop;
    if (this.options.preview) this.options.preview.scrollTop = this.previewScrollTop;
  }

  private applyShare(): void {
    this.options.workspace.style.setProperty("--editor-share", percentage(this.share));
    this.options.workspace.style.setProperty(
      "--editor-width",
      `calc(${percentage(this.share)} - ${String(this.share * SIDEBAR_WIDTH)}px)`,
    );
    if (this.share === DEFAULT_SHARE) {
      delete this.options.workspace.dataset["dividerCustom"];
    } else {
      this.options.workspace.dataset["dividerCustom"] = "true";
    }
  }
}
