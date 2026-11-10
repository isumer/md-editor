export type ViewMode = "split" | "editor" | "preview";

const DIVIDER_STORAGE_KEY = "view.dividerShare";
const DEFAULT_SHARE = 0.5;
const MIN_SHARE = 0.2;
const MAX_SHARE = 0.8;
// Keep wrapped pane contents stable across gaps in a native resize burst.
const RESIZE_SETTLE_MS = 500;

export interface ViewControllerOptions {
  readonly divider: HTMLElement;
  readonly workspace: HTMLElement;
  readonly enterFullScreen?: () => Promise<void>;
  readonly leaveFullScreen?: () => Promise<void>;
}

function savedShare(): number {
  const value = Number(localStorage.getItem(DIVIDER_STORAGE_KEY));
  return Number.isFinite(value) && value >= MIN_SHARE && value <= MAX_SHARE
    ? value
    : DEFAULT_SHARE;
}

function percentage(share: number): string {
  return `${String(Math.round(share * 1_000) / 10)}%`;
}

export class ViewController {
  private mode: ViewMode = "split";
  private share = savedShare();
  private dragging = false;
  private resizeTimer: number | null = null;
  private readonly enterFullScreen: () => Promise<void>;
  private readonly leaveFullScreen: () => Promise<void>;

  constructor(private readonly options: ViewControllerOptions) {
    this.enterFullScreen = options.enterFullScreen ?? (() =>
      document.documentElement.requestFullscreen().then(() => undefined));
    this.leaveFullScreen = options.leaveFullScreen ?? (() =>
      document.fullscreenElement ? document.exitFullscreen() : Promise.resolve());
    this.applyShare();
    this.setMode("split");
    options.divider.addEventListener("pointerdown", this.startDrag);
    options.divider.addEventListener("dblclick", this.resetDivider);
    window.addEventListener("pointermove", this.drag);
    window.addEventListener("pointerup", this.endDrag);
    window.addEventListener("resize", this.resize);
  }

  get dividerShare(): number {
    return this.share;
  }

  get viewMode(): ViewMode {
    return this.mode;
  }

  get focusMode(): boolean {
    return document.body.classList.contains("focus-mode");
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.options.workspace.dataset["viewMode"] = mode;
    if (mode === "split") this.capturePaneWidths();
  }

  async enterFocusMode(): Promise<void> {
    if (this.focusMode) return;
    await this.enterFullScreen();
    document.body.classList.add("focus-mode");
    this.capturePaneWidths();
  }

  async leaveFocusMode(): Promise<void> {
    if (!this.focusMode) return;
    await this.leaveFullScreen();
    document.body.classList.remove("focus-mode");
    this.capturePaneWidths();
  }

  async toggleFocusMode(): Promise<void> {
    if (this.focusMode) {
      await this.leaveFocusMode();
    } else {
      await this.enterFocusMode();
    }
  }

  private readonly startDrag = (event: PointerEvent): void => {
    if (this.mode !== "split") return;
    event.preventDefault();
    this.dragging = true;
    this.updateShare(event.clientX);
  };

  private readonly drag = (event: PointerEvent): void => {
    if (this.dragging) this.updateShare(event.clientX);
  };

  private readonly endDrag = (): void => {
    if (!this.dragging) return;
    this.dragging = false;
    localStorage.setItem(DIVIDER_STORAGE_KEY, String(this.share));
  };

  private readonly resetDivider = (): void => {
    this.share = DEFAULT_SHARE;
    this.applyShare();
    this.capturePaneWidths();
    localStorage.setItem(DIVIDER_STORAGE_KEY, String(this.share));
  };

  private readonly resize = (): void => {
    if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(this.finishResize, RESIZE_SETTLE_MS);
  };

  private readonly finishResize = (): void => {
    this.resizeTimer = null;
    if (this.mode === "split") this.capturePaneWidths();
  };

  private capturePaneWidths(): void {
    const editor = this.options.divider.previousElementSibling;
    const preview = this.options.divider.nextElementSibling;
    if (!(editor instanceof HTMLElement) || !(preview instanceof HTMLElement)) return;
    const workspaceBounds = this.options.workspace.getBoundingClientRect();
    const dividerBounds = this.options.divider.getBoundingClientRect();
    const editorBounds = editor.getBoundingClientRect();
    this.options.workspace.dataset["stablePaneWidths"] = "true";
    this.options.workspace.style.setProperty(
      "--editor-resize-width",
      `${String(Math.max(0, dividerBounds.left - editorBounds.left))}px`,
    );
    this.options.workspace.style.setProperty(
      "--preview-resize-width",
      `${String(Math.max(0, workspaceBounds.right - dividerBounds.right))}px`,
    );
  }

  private updateShare(clientX: number): void {
    const bounds = this.options.workspace.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const left = this.options.divider.previousElementSibling?.getBoundingClientRect().left ?? bounds.left;
    const next = (clientX - left) / bounds.width;
    this.share = Math.min(MAX_SHARE, Math.max(MIN_SHARE, next));
    this.applyShare();
    this.capturePaneWidths();
  }

  private applyShare(): void {
    this.options.workspace.style.setProperty("--editor-share", percentage(this.share));
  }
}
