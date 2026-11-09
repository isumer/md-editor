export type ViewMode = "split" | "editor" | "preview";

const DIVIDER_STORAGE_KEY = "view.dividerShare";
const DEFAULT_SHARE = 0.5;
const MIN_SHARE = 0.2;
const MAX_SHARE = 0.8;

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
  }

  async enterFocusMode(): Promise<void> {
    if (this.focusMode) return;
    await this.enterFullScreen();
    document.body.classList.add("focus-mode");
  }

  async leaveFocusMode(): Promise<void> {
    if (!this.focusMode) return;
    document.body.classList.remove("focus-mode");
    await this.leaveFullScreen();
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
    localStorage.setItem(DIVIDER_STORAGE_KEY, String(this.share));
  };

  private updateShare(clientX: number): void {
    const bounds = this.options.workspace.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const next = (clientX - bounds.left) / bounds.width;
    this.share = Math.min(MAX_SHARE, Math.max(MIN_SHARE, next));
    this.applyShare();
  }

  private applyShare(): void {
    this.options.workspace.style.setProperty("--editor-share", percentage(this.share));
  }
}
