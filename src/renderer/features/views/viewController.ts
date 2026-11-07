export type ViewMode = "split" | "editor" | "preview";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface ViewControllerOptions {
  workspace: HTMLElement;
  divider: HTMLElement;
  status: HTMLElement;
  storage?: StorageLike;
}

export interface ViewController {
  readonly mode: ViewMode;
  readonly dividerPercent: number;
  readonly focusMode: boolean;
  setMode(mode: ViewMode): void;
  setDividerPercent(percent: number): void;
  enterFocusMode(): void;
  exitFocusMode(): void;
  dispose(): void;
}

const DIVIDER_STORAGE_KEY = "view.dividerPercent";
const MIN_DIVIDER_PERCENT = 15;
const MAX_DIVIDER_PERCENT = 85;

function storedDivider(storage: StorageLike | undefined): number {
  try {
    const value = Number(storage?.getItem(DIVIDER_STORAGE_KEY) ?? "50");
    return Number.isFinite(value)
      ? Math.min(MAX_DIVIDER_PERCENT, Math.max(MIN_DIVIDER_PERCENT, value))
      : 50;
  } catch {
    return 50;
  }
}

function saveDivider(storage: StorageLike | undefined, percent: number): void {
  try {
    storage?.setItem(DIVIDER_STORAGE_KEY, String(percent));
  } catch {
    // Storage can be unavailable in a locked-down renderer.
  }
}

function pointerPercent(event: MouseEvent, workspace: HTMLElement): number {
  const bounds = workspace.getBoundingClientRect();
  return bounds.width === 0 ? 50 : ((event.clientX - bounds.left) / bounds.width) * 100;
}

export function createViewController(options: ViewControllerOptions): ViewController {
  let mode: ViewMode = "split";
  let dividerPercent = storedDivider(options.storage);
  let focusMode = false;
  let modeBeforeFocus: ViewMode = mode;
  let dragging = false;

  function applyDividerPercent(percent: number): void {
    dividerPercent = Math.min(MAX_DIVIDER_PERCENT, Math.max(MIN_DIVIDER_PERCENT, percent));
    options.workspace.style.setProperty("--editor-width", `${String(dividerPercent)}%`);
  }

  function setDividerPercent(percent: number): void {
    applyDividerPercent(percent);
    saveDivider(options.storage, dividerPercent);
  }

  function moveDivider(event: MouseEvent): void {
    if (dragging) {
      applyDividerPercent(pointerPercent(event, options.workspace));
    }
  }

  const startDragging = (): void => {
    dragging = true;
  };
  const stopDragging = (): void => {
    if (dragging) {
      saveDivider(options.storage, dividerPercent);
    }
    dragging = false;
  };
  const resetDivider = (): void => {
    setDividerPercent(50);
  };

  options.divider.addEventListener("pointerdown", startDragging);
  window.addEventListener("pointermove", moveDivider);
  window.addEventListener("pointerup", stopDragging);
  options.divider.addEventListener("dblclick", resetDivider);
  options.workspace.dataset["viewMode"] = mode;
  setDividerPercent(dividerPercent);

  return {
    get mode() {
      return mode;
    },
    get dividerPercent() {
      return dividerPercent;
    },
    get focusMode() {
      return focusMode;
    },
    setMode(nextMode) {
      mode = nextMode;
      options.workspace.dataset["viewMode"] = nextMode;
    },
    setDividerPercent,
    enterFocusMode() {
      if (!focusMode) {
        modeBeforeFocus = mode;
      }
      focusMode = true;
      options.workspace.dataset["focusMode"] = "true";
      options.status.hidden = true;
    },
    exitFocusMode() {
      if (focusMode) {
        mode = modeBeforeFocus;
        options.workspace.dataset["viewMode"] = mode;
      }
      focusMode = false;
      delete options.workspace.dataset["focusMode"];
      options.status.hidden = false;
    },
    dispose() {
      options.divider.removeEventListener("pointerdown", startDragging);
      window.removeEventListener("pointermove", moveDivider);
      window.removeEventListener("pointerup", stopDragging);
      options.divider.removeEventListener("dblclick", resetDivider);
    },
  };
}
