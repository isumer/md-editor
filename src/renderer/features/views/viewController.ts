export type ViewMode = "split" | "editor" | "preview";

const STORAGE_KEY = "view.dividerShare";
const DEFAULT_SHARE = 0.5;
const MIN_SHARE = 0.2;
const MAX_SHARE = 0.8;
const SIDEBAR_WIDTH = 220;
const RESIZE_SETTLE_MS = 500;

export interface ViewControllerOptions {
  readonly divider: HTMLElement;
  readonly editorScroll?: HTMLElement;
  readonly enterFullScreen?: () => Promise<void>;
  readonly leaveFullScreen?: () => Promise<void>;
  readonly preview?: HTMLElement;
  readonly workspace: HTMLElement;
}

interface PreviewAnchor {
  readonly block: HTMLElement;
  readonly offset: number;
  readonly preview: HTMLElement;
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

function leaveBrowserFullScreen(): Promise<void> {
  if (document.fullscreenElement === null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      document.removeEventListener("fullscreenchange", changed);
      document.removeEventListener("fullscreenerror", failed);
    };
    const changed = (): void => {
      if (document.fullscreenElement !== null) return;
      cleanup();
      resolve();
    };
    const failed = (): void => {
      cleanup();
      reject(new Error("Full-screen exit failed"));
    };
    document.addEventListener("fullscreenchange", changed);
    document.addEventListener("fullscreenerror", failed);
    if (document.fullscreenElement === null) {
      changed();
    } else {
      void document.exitFullscreen().then(changed, failed);
    }
  });
}

function visiblePreviewBlock(preview: HTMLElement): HTMLElement | null {
  if (typeof document.elementFromPoint !== "function") return null;
  const bounds = preview.getBoundingClientRect();
  const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + 1);
  const direct = hit?.closest<HTMLElement>(".preview-block");
  if (direct !== null && direct !== undefined) return direct;
  const page = hit?.closest<HTMLElement>(".preview-page");
  return [...(page?.querySelectorAll<HTMLElement>(".preview-block") ?? [])]
    .find((block) => block.getBoundingClientRect().bottom > bounds.top) ?? null;
}

export class ViewController {
  private share = savedShare();
  private dragging = false;
  private mode: ViewMode = "split";
  private editorScrollTop = 0;
  private previewScrollTop = 0;
  private restoreGeneration = 0;
  private resizeTimer: number | null = null;
  private readonly enterFullScreen: () => Promise<void>;
  private readonly leaveFullScreen: () => Promise<void>;

  constructor(private readonly options: ViewControllerOptions) {
    this.enterFullScreen = options.enterFullScreen ?? (() =>
      document.documentElement.requestFullscreen().then(() => undefined));
    this.leaveFullScreen = options.leaveFullScreen ?? leaveBrowserFullScreen;
    this.editorScrollTop = options.editorScroll?.scrollTop ?? 0;
    this.previewScrollTop = options.preview?.scrollTop ?? 0;
    this.applyShare();
    this.setMode("split");
    options.divider.addEventListener("pointerdown", this.startDrag);
    options.divider.addEventListener("dblclick", this.resetDivider);
    window.addEventListener("pointermove", this.drag);
    window.addEventListener("pointerup", this.endDrag);
    window.addEventListener("resize", this.resize);
    this.refreshPaneWidths();
  }

  get focusMode(): boolean {
    return document.body.classList.contains("focus-mode");
  }

  setMode(mode: ViewMode): void {
    this.captureScroll();
    this.mode = mode;
    this.options.workspace.dataset["viewMode"] = mode;
    this.restoreScroll();
    const generation = ++this.restoreGeneration;
    requestAnimationFrame(() => {
      if (generation !== this.restoreGeneration) return;
      this.restoreScroll();
      requestAnimationFrame(() => {
        if (generation === this.restoreGeneration) this.restoreScroll();
      });
    });
    if (mode === "split") this.refreshPaneWidths();
  }

  async enterFocusMode(): Promise<void> {
    if (this.focusMode) return;
    document.body.classList.add("focus-mode");
    try {
      await this.enterFullScreen();
    } catch (error) {
      document.body.classList.remove("focus-mode");
      throw error;
    }
    if (!this.focusMode) {
      await this.leaveFullScreen();
      return;
    }
    this.refreshPaneWidths();
  }

  async leaveFocusMode(): Promise<void> {
    if (!this.focusMode) return;
    await this.leaveFullScreen();
    document.body.classList.remove("focus-mode");
    this.refreshPaneWidths();
  }

  async toggleFocusMode(): Promise<void> {
    if (this.focusMode) await this.leaveFocusMode();
    else await this.enterFocusMode();
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

  private readonly resize = (): void => {
    if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(this.finishResize, RESIZE_SETTLE_MS);
  };

  private readonly finishResize = (): void => {
    this.resizeTimer = null;
    if (this.mode === "split") this.refreshPaneWidths();
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

  private capturePreviewAnchor(): PreviewAnchor | null {
    const preview = this.options.preview;
    if (preview === undefined) return null;
    const block = visiblePreviewBlock(preview);
    if (block === null) return null;
    return {
      block,
      offset: block.getBoundingClientRect().top - preview.getBoundingClientRect().top,
      preview,
    };
  }

  private restorePreviewAnchor(anchor: PreviewAnchor | null): void {
    if (anchor === null || !anchor.block.isConnected) return;
    const blockTop = anchor.block.getBoundingClientRect().top;
    const previewTop = anchor.preview.getBoundingClientRect().top;
    anchor.preview.scrollTop += blockTop - previewTop - anchor.offset;
  }

  private refreshPaneWidths(): void {
    const editor = this.options.divider.previousElementSibling;
    const preview = this.options.preview;
    if (!(editor instanceof HTMLElement) || preview === undefined) return;
    const anchor = this.capturePreviewAnchor();
    delete this.options.workspace.dataset["stablePaneWidths"];
    const editorWidth = editor.getBoundingClientRect().width;
    const previewWidth = preview.getBoundingClientRect().width;
    if (editorWidth > 0 && previewWidth > 0) {
      this.options.workspace.style.setProperty("--editor-resize-width", `${String(editorWidth)}px`);
      this.options.workspace.style.setProperty("--preview-resize-width", `${String(previewWidth)}px`);
      this.options.workspace.dataset["stablePaneWidths"] = "true";
    }
    this.restorePreviewAnchor(anchor);
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
